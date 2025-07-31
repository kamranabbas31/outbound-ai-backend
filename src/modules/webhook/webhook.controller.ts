// src/modules/webhook/webhook.controller.ts
import { Controller, Post, Body, Headers, Req, Res } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { Request, Response } from 'express';

@Controller('webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    try {
      const rawBody = JSON.stringify(req.body);
      await this.webhookService.processWebhook(rawBody);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Webhook error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
}
