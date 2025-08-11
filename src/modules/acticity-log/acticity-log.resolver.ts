import { Args, Query, Resolver } from '@nestjs/graphql';
import { LeadActivityLogFilterInput } from './dto/activity-log-filter.input';
import { ActicityLogService } from './acticity-log.service';

@Resolver()
export class ActicityLogResolver {
  constructor(private readonly activityLogService: ActicityLogService) {}
  @Query('leadActivityLogs')
  async leadActivityLogs(@Args('filter') filter: LeadActivityLogFilterInput) {
    return this.activityLogService.findByFilter(filter);
  }
}
