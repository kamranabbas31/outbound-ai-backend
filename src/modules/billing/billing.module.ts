import { Module } from '@nestjs/common';
import { BillingResolver } from './billing.resolver';
import { BillingService } from './billing.service';

@Module({
  providers: [BillingResolver, BillingService]
})
export class BillingModule {}
