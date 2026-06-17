import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('message:send')
  handleMessage(
    @MessageBody() payload: { roomId: string; content: string },
    @ConnectedSocket() client: Socket,
  ): void {
    client.to(payload.roomId).emit('message:received', {
      senderId: client.id,
      content: payload.content,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('room:join')
  handleJoinRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ): void {
    void client.join(roomId);
  }
}
