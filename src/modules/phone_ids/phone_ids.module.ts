import { Module } from '@nestjs/common';
import { PhoneIdsResolver } from './phone_ids.resolver';
import { PhoneIdsService } from './phone_ids.service';

@Module({
  providers: [PhoneIdsResolver, PhoneIdsService]
})
export class PhoneIdsModule {}
