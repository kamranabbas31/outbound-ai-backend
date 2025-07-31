// src/modules/phone-ids/phone-ids.resolver.ts
import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { PhoneIdsService } from './phone_ids.service';

@Resolver()
export class PhoneIdsResolver {
  constructor(private readonly phoneIdsService: PhoneIdsService) {}

  @Query('getMultipleAvailablePhoneIds')
  async getMultipleAvailablePhoneIds(
    @Args('count', { type: () => Int }) count: number,
  ): Promise<string[]> {
    return this.phoneIdsService.getMultipleAvailablePhoneIds(count);
  }
}
