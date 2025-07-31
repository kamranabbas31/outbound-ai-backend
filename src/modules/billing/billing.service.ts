import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}
  async fetchBillingData(
    userId: string,
    start: string,
    end: string,
  ): Promise<{
    userError: { message: string } | null;
    data: {
      totalCalls: number;
      totalMinutes: number;
      totalCost: number;
    } | null;
  }> {
    try {
      console.log(
        'Fetching billing data for user:',
        userId,
        'from',
        start,
        'to',
        end,
      );
      const campaigns = await this.prisma.campaigns.findMany({
        where: {
          user_id: userId,
          created_at: {
            gte: new Date(start),
            lte: new Date(end + 'T23:59:59'),
          },
        },
        select: {
          completed: true,
          duration: true,
          cost: true,
        },
      });

      const totalCalls = campaigns.reduce(
        (sum, c) => sum + (c.completed ?? 0),
        0,
      );
      const totalMinutes = campaigns.reduce(
        (sum, c) => sum + (c.duration ?? 0),
        0,
      );
      const totalCost = campaigns.reduce((sum, c) => sum + (c.cost ?? 0), 0);

      return {
        userError: null,
        data: {
          totalCalls,
          totalMinutes: parseFloat(totalMinutes.toFixed(2)),
          totalCost: parseFloat(totalCost.toFixed(2)),
        },
      };
    } catch (error) {
      console.error('Error in fetchBillingData:', error);
      return {
        userError: { message: 'Internal server error' },
        data: null,
      };
    }
  }
}
