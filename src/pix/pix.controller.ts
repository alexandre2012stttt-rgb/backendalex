// src/pix/pix.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { PixService } from './pix.service';

@Controller('pix')
export class PixController {
  constructor(private readonly pixService: PixService) {}

  /**
   * Criar pagamento PIX – chamado pelo seu FRONT da V0
   * Rota: POST /pix/gerar
   */
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

    // Retorno limpinho pro front
    return {
      ok: true,
      paymentId: result.payment.paymentId,
      qrCode: result.payment.qrCode,
      expiresAt: result.payment.expiresAt,
      raw: result.raw, // retorna tudo que a wiin mandou
    };
  }

  /**
   * Consultar status – usado pelo front ou bot do Telegram
   * Rota: GET /pix/status/:id
   */
  @Get('status/:id')
  async getStatus(@Param('id') id: string) {
    if (!id) throw new BadRequestException('ID é obrigatório');

    return this.pixService.getStatusByPaymentIdOrCode(id);
  }
}
