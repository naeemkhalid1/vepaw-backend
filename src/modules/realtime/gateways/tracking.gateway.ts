import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/tracking', cors: { origin: '*' } })
export class TrackingGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('location:update')
  handleLocationUpdate(
    @MessageBody() payload: { lat: number; lng: number },
    @ConnectedSocket() client: Socket,
  ): void {
    client.broadcast.emit('location:updated', { clientId: client.id, ...payload });
  }
}
