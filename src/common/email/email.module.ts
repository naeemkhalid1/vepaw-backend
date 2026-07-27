import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { BrevoEmailService } from './brevo-email.service';

// EmailService (SendGrid) is kept registered but unused by any call site for now — not currently
// usable (see ARCHETECTURE.md), left in place to swap back in later. BrevoEmailService is what
// actually sends mail today.
@Global()
@Module({
  providers: [EmailService, BrevoEmailService],
  exports: [EmailService, BrevoEmailService],
})
export class EmailModule {}
