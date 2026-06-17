import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PdfProcessor {
  private readonly logger = new Logger(PdfProcessor.name);

  async generatePetPassport(petId: string): Promise<void> {
    this.logger.log(`Generating pet passport PDF for pet: ${petId}`);
  }
}
