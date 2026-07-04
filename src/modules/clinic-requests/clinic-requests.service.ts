import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ClinicDispense, ClinicDispenseDocument } from '../../database/schemas/clinic-dispense.schema';
import { Listing, ListingDocument } from '../../database/schemas/listing.schema';
import { Pet, PetDocument } from '../../database/schemas/pet.schema';
import { Vet, VetDocument } from '../../database/schemas/vet.schema';
import { Thread, ThreadDocument } from '../../database/schemas/thread.schema';
import { Message, MessageDocument } from '../../database/schemas/message.schema';
import { toClinicDispenseResponse } from '../../shared/mappers/clinic-request.mapper';
import { ClinicDispenseResponse, MessageResponse, ServiceResponse } from '../../shared/types';
import { CreateClinicRequestDto } from './dto/create-clinic-request.dto';
import { ChatGateway } from '../realtime/gateways/chat.gateway';

@Injectable()
export class ClinicRequestsService {
  constructor(
    @InjectModel(ClinicDispense.name) private readonly clinicDispenseModel: Model<ClinicDispenseDocument>,
    @InjectModel(Listing.name) private readonly listingModel: Model<ListingDocument>,
    @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    @InjectModel(Vet.name) private readonly vetModel: Model<VetDocument>,
    @InjectModel(Thread.name) private readonly threadModel: Model<ThreadDocument>,
    @InjectModel(Message.name) private readonly messageModel: Model<MessageDocument>,
    private readonly chatGateway: ChatGateway,
  ) {}

  async createRequest(
    userId: string,
    dto: CreateClinicRequestDto,
  ): Promise<ServiceResponse<ClinicDispenseResponse>> {
    const pet = await this.petModel.findById(dto.petId).lean().exec();
    if (!pet) throw new NotFoundException({ message: 'Pet not found', code: 'PET_NOT_FOUND' });
    if (pet.owner.toString() !== userId) {
      throw new ForbiddenException({ message: 'You do not own this pet', code: 'FORBIDDEN' });
    }

    const listing = await this.listingModel
      .findOne({ _id: dto.listingId, status: 'active' })
      .lean()
      .exec();
    if (!listing) throw new NotFoundException({ message: 'Listing not found', code: 'LISTING_NOT_FOUND' });

    const vetObjectId = listing.vet as Types.ObjectId;
    const vet = await this.vetModel.findById(vetObjectId).lean().exec();
    if (!vet) throw new NotFoundException({ message: 'Vet not found', code: 'VET_NOT_FOUND' });

    const ownerObjectId = new Types.ObjectId(userId);

    let thread = await this.threadModel
      .findOne({ user: ownerObjectId, vetId: vetObjectId, type: 'vet' })
      .lean()
      .exec();
    if (!thread) {
      const created = await this.threadModel.create({
        user: ownerObjectId,
        type: 'vet',
        name: vet.name,
        vetId: vetObjectId,
        verified: vet.verified ?? false,
      });
      thread = created.toObject();
    }

    const dispense = await this.clinicDispenseModel.create({
      owner: ownerObjectId,
      pet: new Types.ObjectId(dto.petId),
      vet: vetObjectId,
      listing: new Types.ObjectId(dto.listingId),
      thread: thread._id,
      itemName: listing.name,
      unitPrice: listing.price,
      qty: dto.qty,
      status: 'requested',
    });

    const message = await this.messageModel.create({
      thread: thread._id,
      type: 'clinic_request',
      sender: 'user',
      text: null,
      clinicRequest: {
        requestId: dispense._id,
        itemName: listing.name,
        qty: dto.qty,
        status: 'requested',
      },
    });

    const threadId = (thread._id as Types.ObjectId).toString();
    await this.threadModel.findByIdAndUpdate(thread._id, {
      preview: `Requested: ${listing.name} for ${pet.name}`,
      $inc: { unread: 1 },
    });

    const response: MessageResponse = {
      id: (message._id as Types.ObjectId).toString(),
      thread: threadId,
      type: 'clinic_request',
      sender: 'user',
      text: null,
      product: null,
      pet: null,
      clinicRequest: {
        requestId: (dispense._id as Types.ObjectId).toString(),
        itemName: listing.name,
        qty: dto.qty,
        status: 'requested',
      },
      consultationStatus: null,
      createdAt: (message as MessageDocument).createdAt,
    };

    this.chatGateway.server.to(threadId).emit('message:received', response);

    return {
      data: toClinicDispenseResponse(dispense.toObject(), pet.name, vet.name),
      message: 'Request sent to vet',
    };
  }

  async listMyRequests(userId: string): Promise<ServiceResponse<ClinicDispenseResponse[]>> {
    const requests = await this.clinicDispenseModel
      .find({ owner: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    if (requests.length === 0) return { data: [], message: 'Requests retrieved' };

    const petIds = [...new Set(requests.map((r) => (r.pet as Types.ObjectId).toString()))];
    const vetIds = [...new Set(requests.map((r) => (r.vet as Types.ObjectId).toString()))];

    const [pets, vets] = await Promise.all([
      this.petModel.find({ _id: { $in: petIds } }).select('name').lean().exec(),
      this.vetModel.find({ _id: { $in: vetIds } }).select('name').lean().exec(),
    ]);

    const petNames = new Map(pets.map((p) => [(p._id as Types.ObjectId).toString(), p.name]));
    const vetNames = new Map(vets.map((v) => [(v._id as Types.ObjectId).toString(), v.name]));

    const data = requests.map((r) =>
      toClinicDispenseResponse(
        r,
        petNames.get((r.pet as Types.ObjectId).toString()) ?? 'Pet',
        vetNames.get((r.vet as Types.ObjectId).toString()) ?? 'Vet',
      ),
    );

    return { data, message: 'Requests retrieved' };
  }

  async cancelRequest(userId: string, requestId: string): Promise<ServiceResponse<null>> {
    const request = await this.clinicDispenseModel.findById(requestId).exec();
    if (!request) throw new NotFoundException({ message: 'Request not found', code: 'REQUEST_NOT_FOUND' });
    if (request.owner.toString() !== userId) {
      throw new ForbiddenException({ message: 'You do not own this request', code: 'FORBIDDEN' });
    }
    if (request.status !== 'requested') {
      throw new BadRequestException({
        message: 'Only pending requests can be cancelled',
        code: 'INVALID_STATUS',
      });
    }

    request.status = 'cancelled';
    request.cancelledAt = new Date();
    await request.save();

    return { data: null, message: 'Request cancelled' };
  }
}
