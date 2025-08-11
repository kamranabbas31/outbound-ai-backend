import { Module } from '@nestjs/common';
import { CadenceService } from './cadence.service';
import { CadenceResolver } from './cadence.resolver';
import { TriggerCallModule } from '../call/trigger-call.module';
import { PrismaService } from '../prisma/prisma.service'; // 👈 Import here
@Module({
  imports: [TriggerCallModule], // 👈 Required to resolve TriggerCallService
  providers: [CadenceService, CadenceResolver, PrismaService],
  exports: [CadenceService],
})
export class CadenceModule {}
