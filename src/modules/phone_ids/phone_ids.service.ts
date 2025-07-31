// src/modules/phone-ids/phone-ids.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PhoneIdsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMultipleAvailablePhoneIds(count: number): Promise<string[]> {
    const phoneIds = await this.prisma.phone_ids.findMany({
      where: {
        is_active: true,
      },
      orderBy: [{ daily_usage: 'asc' }, { last_used_date: 'asc' }],
      take: count,
      select: {
        phone_id: true,
      },
    });

    return phoneIds.map((p) => p.phone_id);
  }
}
