// src/modules/webhook/webhook.module.ts
import { Module } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { WebhookResolver } from './webhook.resolver';
import { PrismaModule } from 'src/modules/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookResolver],
})
export class WebhookModule {}
