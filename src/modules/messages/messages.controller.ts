import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../shared/types';

@ApiTags('messages')
@ApiBearerAuth()
@Controller()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('messages/threads')
  @ApiOperation({ summary: 'Get all message threads' })
  getThreads(@CurrentUser() user: JwtPayload) {
    return this.messagesService.getThreads(user.sub);
  }

  @Get('consultations/vet/:vetId/messages')
  @ApiOperation({ summary: 'Get chat history with a vet' })
  getVetMessages(@CurrentUser() user: JwtPayload, @Param('vetId') vetId: string) {
    return this.messagesService.getVetMessages(user.sub, vetId);
  }
}
