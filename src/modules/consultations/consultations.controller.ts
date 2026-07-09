import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConsultationsService } from './consultations.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { imageUploadOptions } from '../../common/storage/image-upload.options';
import type { JwtPayload } from '../../shared/types';

@ApiTags('consultations')
@ApiBearerAuth()
@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Post()
  @ApiOperation({ summary: 'Start a paid text consultation with a vet (requires prior completed appointment)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateConsultationDto) {
    return this.consultationsService.createConsultation(user.sub, dto);
  }

  @Post(':id/submit-payment')
  @UseInterceptors(FileInterceptor('proof', imageUploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload payment proof screenshot for a pending consultation' })
  submitPayment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @UploadedFile() proof: Express.Multer.File,
  ) {
    return this.consultationsService.submitPayment(user.sub, id, proof);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a consultation session — only while awaiting payment' })
  cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.consultationsService.cancelConsultation(user.sub, id);
  }

  @Get()
  @ApiOperation({ summary: 'List own consultation sessions' })
  list(@CurrentUser() user: JwtPayload) {
    return this.consultationsService.listMyConsultations(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get consultation session detail' })
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.consultationsService.getConsultation(user.sub, id);
  }
}
