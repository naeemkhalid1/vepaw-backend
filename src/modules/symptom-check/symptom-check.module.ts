import { Module } from '@nestjs/common';
import { SymptomCheckController } from './symptom-check.controller';
import { SymptomCheckService } from './symptom-check.service';

@Module({
  controllers: [SymptomCheckController],
  providers: [SymptomCheckService],
  exports: [SymptomCheckService],
})
export class SymptomCheckModule {}
