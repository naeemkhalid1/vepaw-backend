import { Global, Module } from '@nestjs/common';
import { SafepayService } from './safepay.service';

@Global()
@Module({
  providers: [SafepayService],
  exports: [SafepayService],
})
export class PaymentsModule {}
