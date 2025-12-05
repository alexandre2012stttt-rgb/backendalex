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

  // ---------------------------------------------------
  // 🚀 ROTA PARA GERAR PAGAMENTO PIX
  // ---------------------------------------------------
  @Post('gerar')
  async gerarPagamento(@Body() body: any) {
    const { valueCents, name, email, planId, planoId, description } = body;

    // ⛔ Se o body vier vazio, cai aqui (ex: main.ts errado)
    if (!valueCents || !name || !email) {
      throw new BadRequestException(
        'valueCents, name e email são obrigatórios'
      );
    }

    // 🔥 Aceita planId OU planoId da v0
    const finalPlanId = planId ?? planoId ?? null;

    const result = await this.pixService.criarPagamento({
      valueCents,
      name,
      email,
      planId: finalPlanId,
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

  // ---------------------------------------------------
  // 🔍 CONSULTAR STATUS DO PAGAMENTO OU CÓDIGO
  // ---------------------------------------------------
  @Get('status/:id')
  async getStatus(@Param('id') id: string) {
    if (!id) throw new BadRequestException('ID é obrigatório');

    return this.pixService.getStatusByPaymentIdOrCode(id);
  }

  // ---------------------------------------------------
  // 📩 ROTA DO WEBHOOK (WiinPay → Render)
  // ---------------------------------------------------
  @Post('webhook')
  async webhook(@Body() body: any, @Headers() headers: any) {
    console.log('📩 Webhook recebido:', body);
    return this.pixService.processarWebhook(headers, body);
  }
}
