import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/calls', cors: { origin: '*' } })
export class CallsGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('call:ring')
  handleRing(
    @MessageBody() payload: { targetUserId: string; callerId: string },
    @ConnectedSocket() _client: Socket,
  ): void {
    this.server.to(payload.targetUserId).emit('call:incoming', {
      callerId: payload.callerId,
    });
  }

  @SubscribeMessage('call:answer')
  handleAnswer(
    @MessageBody() payload: { callerId: string; agoraToken: string },
    @ConnectedSocket() _client: Socket,
  ): void {
    this.server.to(payload.callerId).emit('call:answered', {
      agoraToken: payload.agoraToken,
    });
  }

  @SubscribeMessage('call:decline')
  handleDecline(
    @MessageBody() payload: { callerId: string },
    @ConnectedSocket() _client: Socket,
  ): void {
    this.server.to(payload.callerId).emit('call:declined');
  }
}
