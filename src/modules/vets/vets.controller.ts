import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VetsService } from './vets.service';
import { ListVetsDto } from './dto/list-vets.dto';
import { NearbyVetsDto } from './dto/nearby-vets.dto';
import { EmergencyVetsDto } from './dto/emergency-vets.dto';
import { GetAvailabilityDto } from './dto/get-availability.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';

@ApiTags('vets')
@ApiBearerAuth()
@Controller('vets')
export class VetsController {
  constructor(private readonly vetsService: VetsService) {}

  @Get()
  @ApiOperation({ summary: 'List vets with optional search/filter/geo' })
  listVets(@Query() dto: ListVetsDto) {
    return this.vetsService.listVets(dto);
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Closest N vets to a location (home screen)' })
  nearbyVets(@Query() dto: NearbyVetsDto) {
    return this.vetsService.nearbyVets(dto);
  }

  @Get('emergency')
  @ApiOperation({ summary: 'Nearest emergency vet + all emergency vets within 15 km' })
  emergencyVets(@Query() dto: EmergencyVetsDto) {
    return this.vetsService.emergencyVets(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vet detail' })
  getVet(@Param('id') vetId: string) {
    return this.vetsService.getVet(vetId);
  }

  @Get(':id/availability')
  @ApiOperation({ summary: '30-minute slot availability for a given date' })
  getAvailability(@Param('id') vetId: string, @Query() dto: GetAvailabilityDto) {
    return this.vetsService.getAvailability(vetId, dto);
  }

  @Get(':id/reviews')
  @ApiOperation({ summary: 'Paginated reviews for a vet' })
  getReviews(@Param('id') vetId: string, @Query() dto: ListReviewsDto) {
    return this.vetsService.getReviews(vetId, dto);
  }
}
