import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Thread, ThreadDocument } from '../../../database/schemas/thread.schema';
import { Message, MessageDocument } from '../../../database/schemas/message.schema';
import { Pet, PetDocument } from '../../../database/schemas/pet.schema';
import { Vet, VetDocument } from '../../../database/schemas/vet.schema';
import { JwtPayload, MessageResponse, PetSharePayload } from '../../../shared/types';

interface AuthSocket extends Socket {
  data: {
    user: JwtPayload;
    // vet only: maps incomingId → resolved threadId (key may be patientId or direct threadId)
    vetPatientMap: Record<string, string>;
  };
}

interface SendMessagePayload {
  threadId: string; // vet sends patientId OR actual threadId; owner sends actual threadId
  type: 'text' | 'pet_share';
  text?: string;
  pet?: PetSharePayload;
}

@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // gateway-level map: threadId → patientId
  // populated whenever a vet joins via patientId; used to also broadcast to patientId room
  // so vets receive messages even before they join the threadId room.
  // Bounded + LRU-evicted — this map outlives any single socket connection, so without
  // a cap it grows forever as new vet↔patient threads open over the process's lifetime.
  private readonly threadToPatientRoom = new Map<string, string>();
  private static readonly MAX_THREAD_PATIENT_ENTRIES = 5000;

  private cacheThreadPatientMapping(threadId: string, patientId: string): void {
    if (this.threadToPatientRoom.size >= ChatGateway.MAX_THREAD_PATIENT_ENTRIES) {
      const oldestKey = this.threadToPatientRoom.keys().next().value;
      if (oldestKey !== undefined) this.threadToPatientRoom.delete(oldestKey);
    }
    this.threadToPatientRoom.set(threadId, patientId);
  }

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectModel(Thread.name) private readonly threadModel: Model<ThreadDocument>,
    @InjectModel(Message.name) private readonly messageModel: Model<MessageDocument>,
    @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    @InjectModel(Vet.name) private readonly vetModel: Model<VetDocument>,
  ) {}

  handleConnection(client: AuthSocket): void {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.query?.token as string | undefined);

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      client.data.user = payload;
      client.data.vetPatientMap = {};
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket): void {}

  @SubscribeMessage('room:join')
  async handleJoinRoom(
    @MessageBody() id: string,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    const user = client.data.user;

    if (user.role === 'vet') {
      await this.resolveVetThreadId(user.sub, id, client, false);
    } else {
      // owner side — id is the actual threadId
      const thread = await this.threadModel.findOne({
        _id: new Types.ObjectId(id),
        user: new Types.ObjectId(user.sub),
      }).lean();

      if (!thread) {
        client.emit('error', { message: 'Thread not found' });
        return;
      }
      await client.join(id);
      await this.threadModel.findByIdAndUpdate(id, { unread: 0 });
    }
  }

  @SubscribeMessage('message:send')
  async handleMessage(
    @MessageBody() payload: SendMessagePayload,
    @ConnectedSocket() client: AuthSocket,
  ): Promise<void> {
    try {
      await this.processMessage(payload, client);
    } catch (err) {
      client.emit('error', { message: 'Failed to send message', detail: (err as Error).message });
    }
  }

  private async processMessage(payload: SendMessagePayload, client: AuthSocket): Promise<void> {
    const { threadId: incomingId, type, text, pet } = payload;
    const user = client.data.user;

    if (type === 'text' && !text?.trim()) {
      client.emit('error', { message: 'Text cannot be empty' });
      return;
    }
    if (type === 'pet_share' && !pet) {
      client.emit('error', { message: 'Pet details required for pet_share' });
      return;
    }

    let actualThreadId: string;

    if (user.role === 'vet') {
      const resolved = await this.resolveVetThreadId(user.sub, incomingId, client, true);
      if (!resolved) {
        client.emit('error', { message: 'Patient not found' });
        return;
      }
      actualThreadId = resolved;
    } else {
      // owner side — incomingId is the actual threadId
      const thread = await this.threadModel.findOne({
        _id: new Types.ObjectId(incomingId),
        user: new Types.ObjectId(user.sub),
      }).lean();
      if (!thread) {
        client.emit('error', { message: 'Thread not found' });
        return;
      }
      actualThreadId = incomingId;
    }

    const sender: 'user' | 'doctor' = user.role === 'vet' ? 'doctor' : 'user';

    const message = await this.messageModel.create({
      thread: new Types.ObjectId(actualThreadId),
      type,
      sender,
      text: type === 'text' ? text : null,
      pet: type === 'pet_share' ? pet : null,
      product: null,
    });

    const preview = type === 'pet_share' ? `Shared pet: ${pet!.name}` : (text ?? '');
    const threadUpdate: Record<string, unknown> = { preview };
    if (sender === 'doctor') threadUpdate['$inc'] = { unread: 1 };
    await this.threadModel.findByIdAndUpdate(actualThreadId, threadUpdate);

    const doc = message as MessageDocument & { pet: PetSharePayload | null };
    const response: MessageResponse = {
      id: (message._id as Types.ObjectId).toString(),
      thread: actualThreadId,
      type: message.type,
      sender: message.sender,
      text: message.text,
      product: null,
      pet: doc.pet ?? null,
      clinicRequest: null,
      consultationStatus: null,
      createdAt: doc.createdAt ?? new Date(),
    };

    // Build broadcast target: always threadId room; also patientId room if known.
    // Socket.io deduplicates — a vet in both rooms receives the event only once.
    const patientRoom = this.threadToPatientRoom.get(actualThreadId);
    const broadcast = patientRoom
      ? client.to(actualThreadId).to(patientRoom)
      : client.to(actualThreadId);

    broadcast.emit('message:received', response);
    // Confirm back to sender so frontend can replace the optimistic message with the real id/timestamp
    client.emit('message:sent', response);
  }

  /**
   * Resolves the actual threadId for a vet, handling two cases the frontend sends:
   *   (a) patientId (pet _id) — when no thread existed yet at socket connect time
   *   (b) actual Thread _id — when frontend resolved history first and sends back the threadId
   *
   * Caches result in vetPatientMap[incomingId] = threadId and joins the socket to both
   * the patientId room and the threadId room for guaranteed delivery.
   */
  private async resolveVetThreadId(
    vetId: string,
    incomingId: string,
    client: AuthSocket,
    create: boolean,
  ): Promise<string | null> {
    // 1. Already resolved and cached (non-empty means fully resolved)
    const cached = client.data.vetPatientMap[incomingId];
    if (cached) return cached;

    // 2. Check if incomingId is a direct Thread _id belonging to this vet
    //    (frontend sends actual threadId after history resolves)
    if (Types.ObjectId.isValid(incomingId)) {
      const threadById = await this.threadModel.findOne({
        _id: new Types.ObjectId(incomingId),
        vetId: new Types.ObjectId(vetId),
        type: 'vet' as const,
      }).lean();
      if (threadById) {
        client.data.vetPatientMap[incomingId] = incomingId;
        await client.join(incomingId);
        // also join patientId room if we know it from a previous join
        const patientRoom = this.threadToPatientRoom.get(incomingId);
        if (patientRoom) await client.join(patientRoom);
        return incomingId;
      }
    }

    // 3. Treat as patientId — resolve (or create) via pet → owner → thread
    const thread = await this.resolveVetThread(vetId, incomingId, create);
    if (!thread) return null;

    const threadId = (thread._id as Types.ObjectId).toString();
    client.data.vetPatientMap[incomingId] = threadId;

    // Store gateway-level mapping so broadcasts from owner messages reach this patientId room too
    this.cacheThreadPatientMapping(threadId, incomingId);

    // Join both rooms: patientId for guaranteed pre-thread delivery; threadId for normal delivery
    await client.join(incomingId);
    await client.join(threadId);
    return threadId;
  }

  // resolves patientId (pet _id) → thread for vet; atomically creates if needed
  private async resolveVetThread(
    vetId: string,
    patientId: string,
    create: boolean,
  ): Promise<ThreadDocument | null> {
    const pet = await this.petModel.findById(patientId).select('owner').lean();
    if (!pet) return null;

    const vetObjectId = new Types.ObjectId(vetId);
    const ownerObjectId = pet.owner as Types.ObjectId;
    const filter = { user: ownerObjectId, vetId: vetObjectId, type: 'vet' as const };

    if (!create) {
      return this.threadModel.findOne(filter).exec();
    }

    // upsert ensures only one thread is ever created even under concurrent messages
    const vet = await this.vetModel.findById(vetId).select('name verified').lean();
    return this.threadModel.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          user: ownerObjectId,
          type: 'vet' as const,
          name: vet?.name ?? 'Vet',
          vetId: vetObjectId,
          verified: vet?.verified ?? false,
          preview: null,
          unread: 0,
        },
      },
      { upsert: true, new: true },
    ).exec() as unknown as Promise<ThreadDocument>;
  }
}
