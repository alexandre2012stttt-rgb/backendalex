// src/pix/pix.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes, createHmac } from 'crypto';
import { Payment } from '@prisma/client';

@Injectable()
export class PixService {
  private readonly logger = new Logger(PixService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Configuração dos planos que a v0 envia (1mes, 3meses, 6meses, teste)
   */
  private readonly planosConfig: Record<
    string,
    { valueCents: number; durationDays: number; description: string }
  > = {
    teste:   { valueCents: 300,  durationDays: 1,   description: 'Plano Teste 10 minutos' },
    '1mes':   { valueCents: 1500, durationDays: 30,  description: 'Plano 1 mês' },
    '3meses': { valueCents: 3500, durationDays: 90,  description: 'Plano 3 meses' },
    '6meses': { valueCents: 6000, durationDays: 180, description: 'Plano 6 meses' },
  };

  // -------------------------------------------------------
  // 🔵 CRIAR PAGAMENTO WIINPAY
  // -------------------------------------------------------
  async criarPagamento({
    valueCents,
    name,
    email,
    planId,
    description,
  }: {
    valueCents: number;
    name: string;
    email: string;
    planId?: string | null;
    description?: string;
  }) {
    const WIINPAY_API_KEY = process.env.WIINPAY_API_KEY;
    const WIINPAY_API_URL = process.env.WIINPAY_API_URL;
    const WIINPAY_CALLBACK_URL = process.env.WIINPAY_CALLBACK_URL;

    if (!WIINPAY_API_KEY || !WIINPAY_API_URL || !WIINPAY_CALLBACK_URL) {
      this.logger.error('FALTAM variáveis WIINPAY_* no backend Render');
      throw new Error('WiinPay environment variables missing');
    }

    // Definir preço & duração baseado no plano
    const planoConfig = planId ? this.planosConfig[planId] : undefined;

    const finalValueCents =
      planoConfig?.valueCents ?? valueCents;

    const durationDays =
      planoConfig?.durationDays ?? 30;

    const finalDescription =
      description ?? planoConfig?.description ?? 'Pagamento';

    const body = {
      api_key: WIINPAY_API_KEY,
      value: finalValueCents / 100,
      name,
      email,
      description: finalDescription,
      webhook_url: WIINPAY_CALLBACK_URL,
      metadata: {
        planCode: planId ?? null,
        durationDays,
      }
    };

    this.logger.log(`➡️ Enviando pagamento WiinPay: ${JSON.stringify(body)}`);

    const res = await fetch(
      `${WIINPAY_API_URL.replace(/\/$/, '')}/payment/create`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    const rawText = await res.text();
    let data: any = {};

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (err) {
      this.logger.error('WiinPay retornou JSON inválido: ' + rawText);
      throw new Error('WiinPay returned invalid JSON');
    }

    if (!res.ok) {
      this.logger.error('❌ ERRO WiinPay create: ' + JSON.stringify(data));
      throw new Error('WiinPay create payment failed');
    }

    const paymentId =
      data.paymentId ?? data.id ?? data.reference ?? null;

    const qrCode =
      data.qrcode ?? data.qrCode ?? data.qr ?? null;

    const expiresRaw =
      data.expiresAt ?? data.expires_at ?? null;

    const expiresAt = expiresRaw ? new Date(expiresRaw) : null;

    const payment = await this.prisma.payment.create({
      data: {
        paymentId,
        status: 'PENDING',
        amountCents: finalValueCents,
        qrCode,
        metadata: {
          ...data,
          _localPlan: {
            planCode: planId ?? null,
            durationDays,
          }
        },
        expiresAt,
        planId: null, // nunca usa plano do banco
      },
    });

    return {
      payment,
      raw: data,
    };
  }

  // -------------------------------------------------------
  // 📩 PROCESSAR WEBHOOK (WIINPAY → BACKEND)
  // -------------------------------------------------------
  async processarWebhook(headers: Record<string, any>, body: any) {
    const secret = process.env.WIINPAY_WEBHOOK_SECRET;

    const sigHeader =
      headers?.['x-wiinpay-signature'] ??
      headers?.['x-wiinpay_signature'] ??
      headers?.['x-signature'];

    if (secret && sigHeader) {
      try {
        const raw = typeof body === 'string' ? body : JSON.stringify(body);
        const hmac = createHmac('sha256', secret).update(raw).digest('hex');

        if (!String(sigHeader).includes(hmac) && String(sigHeader) !== hmac) {
          this.logger.warn('⚠️ Webhook com assinatura inválida');
          return { ok: false, reason: 'invalid_signature' };
        }
      } catch {}
    }

    const statusRaw =
      body?.status ?? body?.paymentStatus ?? body?.state ?? null;

    const status = String(statusRaw ?? '').toUpperCase();

    const paymentId =
      body?.paymentId ??
      body?.id ??
      body?.reference ??
      null;

    const metadata = body?.metadata ?? {};

    // Buscar pagamento no banco -----------------------
    let dbPayment: Payment | null = null;

    if (paymentId) {
      dbPayment = await this.prisma.payment.findUnique({
        where: { paymentId }
      }).catch(() => null);
    }

    if (!dbPayment && (metadata as any)?.paymentId) {
      dbPayment = await this.prisma.payment.findUnique({
        where: { paymentId: (metadata as any).paymentId }
      }).catch(() => null);
    }

    if (!dbPayment) {
      return { ok: false, reason: 'payment_not_found' };
    }

    // Já processado?
    if (dbPayment.status === 'PAID') {
      return { ok: true, reason: 'already_processed' };
    }

    // -------------------------------------------------------
    // STATUS = PAID → criar assinatura e finalizar pagamento
    // -------------------------------------------------------
    if (status === 'PAID') {
      const mergedMeta = {
        ...(dbPayment.metadata as any),
        ...(metadata as any),
        body
      };

      const durationDays =
        mergedMeta._localPlan?.durationDays ??
        mergedMeta.durationDays ??
        30;

      const now = new Date();
      const expiresAt =
        new Date(now.getTime() + durationDays * 86400000);

      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: dbPayment.id },
          data: {
            status: 'PAID',
            qrCode: body?.qrCode ?? body?.qrcode ?? dbPayment.qrCode,
            metadata: mergedMeta,
          },
        });

        const code = randomBytes(8).toString('hex').toUpperCase();

        await tx.subscription.create({
          data: {
            code,
            status: 'ACTIVE',
            expiresAt,
            telegramUserId: null,
            paymentId: dbPayment.id,
            planId: null,
          },
        });
      });

      this.logger.log(`💰 Pagamento confirmado: ${dbPayment.paymentId}`);
      return { ok: true };
    }

    // -------------------------------------------------------
    // STATUS ≠ PAID → atualizar pagamento
    // -------------------------------------------------------
    await this.prisma.payment.update({
      where: { id: dbPayment.id },
      data: {
        status: status as any,
        metadata: { ...(dbPayment.metadata as any), body },
      },
    });

    return { ok: true };
  }

  // -------------------------------------------------------
  // 🔍 CONSULTAR STATUS
  // -------------------------------------------------------
  async getStatusByPaymentIdOrCode(idOrCode: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { paymentId: idOrCode },
    });

    if (payment) {
      return {
        paymentId: payment.paymentId,
        status: payment.status,
        qrCode: payment.qrCode,
        expiresAt: payment.expiresAt,
      };
    }

    const sub = await this.prisma.subscription.findFirst({
      where: { OR: [{ id: idOrCode }, { code: idOrCode }] },
    });

    if (!sub) return { status: 'not_found' };

    return {
      paymentId: sub.paymentId,
      status: sub.status,
      accessCode: sub.code,
      expiresAt: sub.expiresAt,
    };
  }
}


