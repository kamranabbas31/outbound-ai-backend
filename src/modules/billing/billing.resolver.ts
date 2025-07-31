import { Args, Query, Resolver } from '@nestjs/graphql';
import { BillingService } from './billing.service';

@Resolver()
export class BillingResolver {
  constructor(private readonly billingService: BillingService) {}
  @Query('fetchBillingData')
  async fetchBillingData(
    @Args('start') start: string,
    @Args('end') end: string,
    @Args('userId') userId: string,
  ): Promise<{
    userError: { message: string } | null;
    data: {
      totalCalls: number;
      totalMinutes: number;
      totalCost: number;
    } | null;
  }> {
    return this.billingService.fetchBillingData(userId, start, end);
  }
}
