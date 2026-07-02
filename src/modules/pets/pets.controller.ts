import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PetsService } from './pets.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { AddVaccinationDto } from './dto/add-vaccination.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { imageUploadOptions } from '../../common/storage/image-upload.options';
import type { JwtPayload } from '../../shared/types';

@ApiTags('pets')
@ApiBearerAuth()
@Controller('pets')
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('photo', imageUploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create a new pet' })
  createPet(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePetDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.petsService.createPet(user.sub, dto, photo);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pet detail' })
  getPet(@CurrentUser() user: JwtPayload, @Param('id') petId: string) {
    return this.petsService.getPet(user.sub, petId);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('photo', imageUploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update pet — all fields optional' })
  updatePet(
    @CurrentUser() user: JwtPayload,
    @Param('id') petId: string,
    @Body() dto: UpdatePetDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.petsService.updatePet(user.sub, petId, dto, photo);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete pet' })
  deletePet(@CurrentUser() user: JwtPayload, @Param('id') petId: string) {
    return this.petsService.deletePet(user.sub, petId);
  }

  @Post(':id/vaccinations')
  @ApiOperation({ summary: 'Add vaccination record to pet' })
  addVaccination(
    @CurrentUser() user: JwtPayload,
    @Param('id') petId: string,
    @Body() dto: AddVaccinationDto,
  ) {
    return this.petsService.addVaccination(user.sub, petId, dto);
  }

  @Get(':id/passport/pdf')
  @ApiOperation({ summary: 'Get pet passport PDF URL' })
  getPassportPdf(@CurrentUser() user: JwtPayload, @Param('id') petId: string) {
    return this.petsService.getPassportPdf(user.sub, petId);
  }
}
