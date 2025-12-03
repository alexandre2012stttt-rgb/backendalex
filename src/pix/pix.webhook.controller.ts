// src/pix/pix.webhook.controller.ts
import {
  Controller,
  Post,
  Body,
  HttpCode,
  Headers,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PixService } from './pix.service';

@Controller('pix')
export class PixWebhookController {
  private readonly logger = new Logger(PixWebhookController.name);

  constructor(private readonly pixService: PixService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Body() body: any, @Headers() headers: any) {
    if (!body) {
      throw new BadRequestException('Body vazio');
    }

    this.logger.log('[WiinPay Webhook Recebido] ' + JSON.stringify(body, null, 2));

    try {
      const result = await this.pixService.processarWebhook(headers, body);
      // Retorna um json simples — WiinPay normalmente apenas procura 200
      return { ok: true, result };
    } catch (err) {
      this.logger.error('Erro ao processar webhook: ' + err.message);
      // Para evitar retry infinito, retornamos 200 mas com detalhe do erro (ou você pode retornar 500 para forçar retry)
      return { ok: false, error: err.message };
    }
  }
}
