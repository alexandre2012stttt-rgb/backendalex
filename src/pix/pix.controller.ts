import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { PixService } from './pix.service';

@Controller('pix')
export class PixController {
  constructor(private readonly pixService: PixService) {}

  @Post('gerar')
  async gerarPagamento(@Body() body: any) {
    const { valueCents, name, email, planId, description } = body;

    if (!valueCents || !name || !email) {
      throw new BadRequestException(
        'valueCents, name e email são obrigatórios'
      );
    }

    const result = await this.pixService.criarPagamento({
      valueCents,
      name,
      email,
      planId: planId ?? null,
      description: description ?? 'Pagamento',
    });

    return {
      ok: true,
      paymentId: result.payment.paymentId,
      qrCode: result.payment.qrCode,
      expiresAt: result.payment.expiresAt,
      raw: result.raw,
    };
  }

  @Get('status/:id')
  async getStatus(@Param('id') id: string) {
    if (!id) throw new BadRequestException('ID é obrigatório');

    return this.pixService.getStatusByPaymentIdOrCode(id);
  }

  // -------------------------------
  // 🚀 ROTA DE WEBHOOK (ÚNICA ADIÇÃO)
  // -------------------------------
  @Post('webhook')
  async webhook(@Body() body: any, @Headers() headers: any) {
    console.log('📩 Webhook recebido:', body);
    return this.pixService.processarWebhook(headers, body);
  }
}
