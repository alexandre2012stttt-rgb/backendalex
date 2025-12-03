// src/pix/pix.controller.ts
import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PixService } from './pix.service';

@Controller('pix')
export class PixController {
  private readonly logger = new Logger(PixController.name);

  constructor(private readonly pixService: PixService) {}

  // -----------------------------
  // POST /pix/gerar  (rota antiga)
  // -----------------------------
  @Post('gerar')
  async gerarPagamento(
    @Body()
    body: {
      valueCents: number;
      name: string;
      email: string;
      planId?: string | null;
      description?: string;
    },
  ) {
    try {
      const { payment, raw } = await this.pixService.criarPagamento({
        valueCents: body.valueCents,
        name: body.name,
        email: body.email,
        planId: body.planId ?? null,
        description: body.description ?? 'Assinatura VIP',
      });

      return {
        ok: true,
        paymentId: payment.paymentId,
        qrCode: payment.qrCode,
        expiresAt: payment.expiresAt,
        raw,
      };
    } catch (err) {
      this.logger.error('Erro gerarPagamento: ' + err.message);
      throw new HttpException(
        { ok: false, error: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // -----------------------------
  // POST /pix/create  (rota NOVA)
  // -----------------------------
  @Post('create')
  async createPagamento(
    @Body()
    body: {
      valueCents: number;
      name: string;
      email: string;
      planId?: string | null;
      description?: string;
    },
  ) {
    try {
      const { payment, raw } = await this.pixService.criarPagamento({
        valueCents: body.valueCents,
        name: body.name,
        email: body.email,
        planId: body.planId ?? null,
        description: body.description ?? 'Assinatura VIP',
      });

      return {
        ok: true,
        paymentId: payment.paymentId,
        qrCode: payment.qrCode,
        expiresAt: payment.expiresAt,
        raw,
      };
    } catch (err) {
      this.logger.error('Erro createPagamento: ' + err.message);
      throw new HttpException(
        { ok: false, error: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}

