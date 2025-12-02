// src/pix/pix.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { PixService } from './pix.service';

@Controller('pix')
export class PixController {
  constructor(private readonly pixService: PixService) {}

  @Get('status')
  async status(@Query('paymentId') paymentId?: string) {
    // se seu fluxo salva paymentId no DB, você pode buscar por paymentId
    // Como aqui só temos subscription por code, suportamos buscar por code via query
    if (!paymentId) {
      return { status: 'missing' };
    }
    return this.pixService.getStatusByPaymentIdOrCode(paymentId);
  }

  @Get('gerar')
  gerar() {
    return this.pixService.gerarPix();
  }
}
