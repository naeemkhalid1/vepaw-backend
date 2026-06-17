import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { SymptomCheckDto } from './dto/symptom-check.dto';
import { ServiceResponse } from '../../shared/types';

export interface SymptomCheckResult {
  urgency: 'low' | 'medium' | 'high' | 'emergency';
  summary: string;
  possibleCauses: string[];
  recommendations: string[];
  seekVetImmediately: boolean;
}

@Injectable()
export class SymptomCheckService {
  private readonly client: Anthropic;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({ apiKey: this.config.getOrThrow<string>('ANTHROPIC_API_KEY') });
  }

  async checkSymptoms(dto: SymptomCheckDto): Promise<ServiceResponse<SymptomCheckResult>> {
    const prompt = `You are a veterinary triage assistant. A pet owner in Lahore, Pakistan has described the following:

Pet: ${dto.species} (${dto.breed}), ${dto.age} year(s) old
Symptoms: ${dto.symptoms.join(', ')}
${dto.notes ? `Additional notes: ${dto.notes}` : ''}

Respond with a JSON object (no markdown, no extra text) matching this exact structure:
{
  "urgency": "low" | "medium" | "high" | "emergency",
  "summary": "1-2 sentence plain-language summary",
  "possibleCauses": ["cause1", "cause2"],
  "recommendations": ["action1", "action2"],
  "seekVetImmediately": true | false
}`;

    let raw: string;
    try {
      const message = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      });
      raw = (message.content[0] as { type: string; text: string }).text.trim();
    } catch {
      throw new ServiceUnavailableException({ code: 'AI_UNAVAILABLE', message: 'AI service is temporarily unavailable' });
    }

    let result: SymptomCheckResult;
    try {
      result = JSON.parse(raw) as SymptomCheckResult;
    } catch {
      throw new ServiceUnavailableException({ code: 'AI_PARSE_ERROR', message: 'Failed to parse AI response' });
    }

    return { data: result, message: 'Symptom analysis complete' };
  }
}
