import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CommunityService } from './community.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../shared/types';

@ApiTags('community')
@ApiBearerAuth()
@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get('posts')
  @ApiOperation({ summary: 'Get community feed (stories + posts)' })
  getFeed(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.communityService.getFeed(page, limit);
  }

  @Post('posts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a community post' })
  createPost(@CurrentUser() user: JwtPayload, @Body() dto: CreatePostDto) {
    return this.communityService.createPost(user.sub, dto);
  }

  @Get('posts/:id')
  @ApiOperation({ summary: 'Get a single post' })
  getPost(@Param('id') id: string) {
    return this.communityService.getPost(id);
  }

  @Get('posts/:id/comments')
  @ApiOperation({ summary: 'Get comments on a post' })
  getComments(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.communityService.getComments(id, page, limit);
  }

  @Get('stories/:id')
  @ApiOperation({ summary: 'Get a single story' })
  getStory(@Param('id') id: string) {
    return this.communityService.getStory(id);
  }
}
