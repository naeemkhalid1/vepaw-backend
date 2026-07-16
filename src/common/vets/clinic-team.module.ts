import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Vet, VetSchema } from '../../database/schemas/vet.schema';
import { ClinicTeamService } from './clinic-team.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Vet.name, schema: VetSchema }])],
  providers: [ClinicTeamService],
  exports: [ClinicTeamService],
})
export class ClinicTeamModule {}
