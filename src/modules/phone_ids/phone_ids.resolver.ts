// src/modules/phone-ids/phone-ids.resolver.ts
import { Resolver, Query, Args, Int, Mutation } from '@nestjs/graphql';
import { PhoneIdsService } from './phone_ids.service';

@Resolver()
export class PhoneIdsResolver {
  constructor(private readonly phoneIdsService: PhoneIdsService) { }

  @Query('getMultipleAvailablePhoneIds')
  async getMultipleAvailablePhoneIds(
    @Args('count', { type: () => Int }) count: number,
  ): Promise<string[]> {
    return this.phoneIdsService.getMultipleAvailablePhoneIds(count);
  }

  @Mutation('createPhoneIds')
  async createPhoneIds(
    @Args('phoneIds', { type: () => [String] }) phoneIds: string[],
  ) {
    return await this.phoneIdsService.createPhoneIds(phoneIds);

  }
}
