// src/pix/pix.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';

@Injectable()
export class PixService {
  private readonly logger = new Logger(PixService.name);

  constructor(private readonly prisma: PrismaService) {}

  gerarPix() {
    return { mensagem: 'PIX gerado com sucesso!' };
  }

  // processar webhook vindo da WiinPay
  async processarWebhook(data: any) {
    // Estrutura esperada: { paymentId, status, metadata, amount, ... }
    const status = data?.status || data?.paymentStatus || null;
    const metadata = data?.metadata || {};
    // metadata pode conter planId, nome, email, durationDays, etc.
    const planDurationDays = metadata?.durationDays ? Number(metadata.durationDays) : 30; // fallback 30 dias

    if (!status) {
      this.logger.warn('Webhook sem status válido');
      return { ok: false };
    }

    // Wiinpay usa "PAID" ou similar
    if (status !== 'PAID') {
      this.logger.log('Pagamento ainda não aprovado: ' + status);
      // registra/atualiza no DB se quiser, por enquanto não cria código
      return { ok: true };
    }

    // Gerar código único (curto)
    const code = this.generateCode();

    // calcular expiresAt
    const now = new Date();
    const expiresAt = new Date(now.getTime() + planDurationDays * 24 * 60 * 60 * 1000);

    // salvar no DB
    const subscription = await this.prisma.subscription.create({
      data: {
        code,
        status: 'PAID',
        expiresAt,
      },
    });

    this.logger.log(`Pagamento aprovado. Código gerado: ${code}`);

    // Aqui: opcional -> notificar front via websocket / guardar paymentId / metadata
    // também você pode armazenar paymentId, amount, customer info etc.

    return {
      ok: true,
      code,
      subscriptionId: subscription.id,
      expiresAt: subscription.expiresAt,
    };
  }

  private generateCode(length = 9) {
    // código alfanum curto
    return randomBytes(16).toString('hex').slice(0, length).toUpperCase();
  }
}
async getStatusByPaymentIdOrCode(idOrCode: string) {
  // tenta por code primeiro
  const sub = await this.prisma.subscription.findFirst({
    where: { OR: [{ id: idOrCode }, { code: idOrCode }] },
  });
  if (!sub) return { status: 'not_found' };
  return {
    paymentId: sub.id,
    status: sub.status,
    accessCode: sub.code,
    expiresAt: sub.expiresAt,