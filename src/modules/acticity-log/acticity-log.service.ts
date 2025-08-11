import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeadActivityLogFilterInput } from './dto/activity-log-filter.input';

@Injectable()
export class ActicityLogService {
  constructor(private readonly prisma: PrismaService) {}

  a;
  async findByFilter(filter: LeadActivityLogFilterInput) {
    const where: any = {};

    if (filter.lead_id) where.lead_id = filter.lead_id;
    if (filter.campaign_id) where.campaign_id = filter.campaign_id;
    if (filter.activity_type) where.activity_type = filter.activity_type;

    try {
      const data = await this.prisma.leadActivityLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
      });
      return { userError: null, data };
    } catch (error) {
      console.error('❌ Failed to fetch lead activity logs:', error);
      return {
        userError: { message: 'Failed to fetch lead activity logs' },
        data: [],
      };
    }
  }
}
