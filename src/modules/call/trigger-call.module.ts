// trigger-call.module.ts
import { Module } from '@nestjs/common';

import { PrismaModule } from 'src/modules/prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { TriggerCallService } from './trigger-call.service';
import { TriggerCallResolver } from './trigger-call.resolver';

@Module({
  imports: [PrismaModule, HttpModule],
  providers: [TriggerCallService, TriggerCallResolver],
})
export class TriggerCallModule {}
