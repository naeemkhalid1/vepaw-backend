import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SymptomCheckService } from './symptom-check.service';
import { SymptomCheckDto } from './dto/symptom-check.dto';

@ApiTags('symptom-check')
@ApiBearerAuth()
@Controller('symptom-check')
export class SymptomCheckController {
  constructor(private readonly symptomCheckService: SymptomCheckService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI-powered pet symptom triage' })
  checkSymptoms(@Body() dto: SymptomCheckDto) {
    return this.symptomCheckService.checkSymptoms(dto);
  }
}
