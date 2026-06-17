import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('vets/pending')
  @ApiOperation({ summary: 'List pending vet applications' })
  getPendingVets(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getPendingVets(page, limit);
  }

  @Patch('vets/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a vet application' })
  approveVet(@Param('id') id: string) {
    return this.adminService.approveVet(id);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Platform analytics dashboard' })
  getAnalytics() {
    return this.adminService.getAnalytics();
  }
}
