import { Args, Query, Resolver } from '@nestjs/graphql';
import { DashboardService } from './dashboard.service';
import { DashboardStatsResponse } from './dto/dto';

@Resolver()
export class DashboardResolver {
    constructor(private readonly dashboardService: DashboardService) { }

    @Query('fetchDashboardStats')
    async fetchDashboardStats(
        @Args('userId') userId: string,
        @Args('startDate', { nullable: true }) startDate?: string,
        @Args('endDate', { nullable: true }) endDate?: string,
    ): Promise<DashboardStatsResponse> {
        try {
            const stats = await this.dashboardService.getDashboardStatsByUser(
                userId,
                startDate,
                endDate
            );
            return { data: stats };
        } catch (error) {
            return { userError: error.message };
        }
    }
}
