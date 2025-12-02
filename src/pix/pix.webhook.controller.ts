// src/pix/pix.webhook.controller.ts
import { Controller, Post, Body, HttpCode, Headers, BadRequestException, Logger } from '@nestjs/common';
import { PixService } from './pix.service';
import * as crypto from 'crypto';

@Controller('pix')
export class PixWebhookController {
  private readonly logger = new Logger(PixWebhookController.name);

  constructor(private readonly pixService: PixService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Body() body: any, @Headers() headers: any) {
    // Ajuste o nome do header conforme WiinPay (ex: x-wiinpay-signature ou x-signature)
    const signatureHeader = headers['x-wiinpay-signature'] || headers['x-signature'] || headers['authorization'];

    const secret = process.env.WIINPAY_WEBHOOK_SECRET;
    if (secret && signatureHeader) {
      const payload = JSON.stringify(body);
      const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      if (expected !== signatureHeader) {
        this.logger.warn('Webhook com assinatura inválida');
        throw new BadRequestException('Invalid signature');
      }
    } else {
      // se você estiver em dev e não tiver secret, apenas loga
      this.logger.warn('WIINPAY_WEBHOOK_SECRET não definido ou header ausente (aceitando em dev)');
    }

    this.logger.log('Webhook Wiinpay recebido: ' + JSON.stringify(body));
    return this.pixService.processarWebhook(body);
  }
}
