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
  // 🚀 GERAR PAGAMENTO PIX
  // ---------------------------------------------------
  @Post('gerar')
  async gerarPagamento(@Body() body: any) {
    const { plano, name, email } = body;

    // 🔒 validações
    if (!plano || typeof plano !== 'string') {
      throw new BadRequestException('Campo "plano" é obrigatório');
    }

    if (!name || !email) {
      throw new BadRequestException('Campos "name" e "email" são obrigatórios');
    }

    // 👇 agora o controller só passa o necessário
    const result = await this.pixService.criarPagamento({
      valueCents: 0,     // será ignorado, o backend define o preço
      name,
      email,
      planId: plano,     // "1mes", "3meses", "6meses" vindo da v0
      description: undefined,
    });

    return {
      ok: true,
      paymentId: result.payment.paymentId,
      qrCode: result.payment.qrCode,
      expiresAt: result.payment.expiresAt,
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
  // 📩 WEBHOOK (WiinPay → Render)
  // ---------------------------------------------------
  @Post('webhook')
  async webhook(@Body() body: any, @Headers() headers: any) {
    console.log('📩 Webhook recebido:', JSON.stringify(body));
    return this.pixService.processarWebhook(headers, body);
  }
}
