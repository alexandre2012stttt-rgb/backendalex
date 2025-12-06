// src/pix/pix.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes, createHmac } from 'crypto';

@Injectable()
export class PixService {
  private readonly logger = new Logger(PixService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Configuração local dos planos.
   * A v0 manda em `planId` algo como "1mes", "3meses", "6meses"
   * e o backend usa isso para definir preço e duração.
   */
  private readonly planosConfig: Record<
    string,
    { valueCents: number; durationDays: number; description: string }
  > = {
    '1mes':   { valueCents: 1500, durationDays: 30,  description: 'Plano 1 mês' },
    '3meses': { valueCents: 3500, durationDays: 90,  description: 'Plano 3 meses' },
    '6meses': { valueCents: 6000, durationDays: 180, description: 'Plano 6 meses' },
  };

  // --- CRIAR PAGAMENTO (chama WiinPay e salva Payment no DB) ---
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
    planId?: string | null; // aqui a v0 manda o "plano" clicado, ex: "1mes"
    description?: string;
  }) {
    const WIINPAY_API_KEY = process.env.WIINPAY_API_KEY;
    const WIINPAY_API_URL = process.env.WIINPAY_API_URL;
    const WIINPAY_CALLBACK_URL = process.env.WIINPAY_CALLBACK_URL;

    if (!WIINPAY_API_KEY || !WIINPAY_API_URL || !WIINPAY_CALLBACK_URL) {
      this.logger.error('WiinPay environment variables missing');
      throw new Error('WiinPay environment variables missing');
    }

    // Se veio um plano conhecido, usamos a config local (preço + duração).
    const planoConfig = planId ? this.planosConfig[planId] : undefined;

    const finalValueCents =
      planoConfig?.valueCents && planoConfig.valueCents > 0
        ? planoConfig.valueCents
        : valueCents;

    const durationDays = planoConfig?.durationDays ?? 30;
    const finalDescription =
      description ?? planoConfig?.description ?? 'Pagamento';

    const body = {
      api_key: WIINPAY_API_KEY,
      value: finalValueCents / 100, // WiinPay espera valor em reais/float
      name,
      email,
      description: finalDescription,
      webhook_url: WIINPAY_CALLBACK_URL,
      metadata: {
        planCode: planId ?? null,    // código do plano vindo da v0
        durationDays,                // dias de validade do plano
      },
    };

    // Log opcional para debug (não salva dados sensíveis)
    this.logger.log(`Enviando pagamento WiinPay: ${JSON.stringify(body)}`);

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
      this.logger.error('WiinPay invalid JSON: ' + rawText);
      throw new Error('WiinPay returned invalid JSON');
    }

    if (!res.ok) {
      this.logger.error(
        'WiinPay create payment error: ' + JSON.stringify(data),
      );
      throw new Error('WiinPay create payment failed');
    }

    // Tentativas de pegar os campos retornados pela WiinPay
    const paymentId =
      data.paymentId ?? data.id ?? data.reference ?? data.payment_id ?? null;

    const qrCode =
      data.qrcode ?? data.qrCode ?? data.qr ?? data.code ?? null;

    const expiresRaw =
      data.expiresAt ??
      data.expires_at ??
      data.expire_at ??
      data.expires ??
      null;

    const expiresAt = expiresRaw ? new Date(expiresRaw) : null;

    // Guardar também as infos que nós definimos (plano, durationDays)
    const mergedMetadata = {
      ...data,
      _localPlan: {
        planCode: planId ?? null,
        durationDays,
      },
    };

    const payment = await this.prisma.payment.create({
      data: {
        paymentId,
        status: 'PENDING',
        amountCents: finalValueCents,
        qrCode,
        metadata: mergedMetadata,
        expiresAt,
        // ⚠️ IMPORTANTE: não amarrar FK em Plan pra não dar P2003
        planId: null,
      },
    });

    return { payment, raw: data };
  }

  // --- PROCESSAR WEBHOOK ---
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
          this.logger.warn('Invalid webhook signature');
          return { ok: false, reason: 'invalid_signature' };
        }
      } catch (e) {
        this.logger.warn('Signature validation failed');
      }
    }

    const statusRaw =
      body?.status ?? body?.paymentStatus ?? body?.state ?? null;

    const status = String(statusRaw ?? '').toUpperCase();

    const paymentId =
      body?.paymentId ??
      body?.id ??
      body?.reference ??
      body?.payment_id ??
      body?.data?.id ??
      null;

    const metadata = body?.metadata ?? body?.meta ?? {};

    if (!status) {
      this.logger.warn('Webhook sem status válido');
      return { ok: false, reason: 'missing_status' };
    }

    // Buscar pagamento
    let dbPayment: any = null;

    if (paymentId) {
      dbPayment = await this.prisma.payment
        .findUnique({ where: { paymentId } })
        .catch(() => null);
    }

    if (!dbPayment && (metadata as any)?.paymentId) {
      dbPayment = await this.prisma.payment
        .findUnique({ where: { paymentId: (metadata as any).paymentId } })
        .catch(() => null);
    }

    if (dbPayment && dbPayment.status === 'PAID') {
      return { ok: true, reason: 'already_processed' };
    }

    if (dbPayment) {
      if (status === 'PAID') {
        // Duration baseado em metadata, não mais em tabela Plan
        const mergedMeta = {
          ...(dbPayment.metadata as any),
          ...(metadata as any),
        };

        const durationDays =
          mergedMeta._localPlan?.durationDays ??
          mergedMeta.durationDays ??
          30;

        const now = new Date();
        const expiresAt = new Date(now.getTime() + durationDays * 86400000);

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
              // ⚠️ Não amarrar mais em Plan
              planId: null,
            },
          });
        });

        this.logger.log(`Pagamento PAID: ${dbPayment.paymentId}`);
        return { ok: true };
      }

      await this.prisma.payment.update({
        where: { id: dbPayment.id },
        data: {
          status: status as any,
          metadata: { ...(dbPayment.metadata as any), ...(metadata as any), body },
        },
      });

      return { ok: true };
    }

    // Caso o pagamento ainda não exista no banco
    const qrCode =
      body?.qrcode ?? body?.qrCode ?? body?.qr ?? null;

    const amount =
      body?.value ?? body?.amount ?? body?.amountCents ?? null;

    const amountCents =
      typeof amount === 'number' ? Math.round(amount * 100) : 0;

    const created = await this.prisma.payment.create({
      data: {
        paymentId: paymentId ?? null,
        status: status === 'PAID' ? 'PAID' : (status as any),
        amountCents,
        qrCode,
        metadata: body ?? {},
        expiresAt: body?.expiresAt ? new Date(body.expiresAt) : null,
        // ⚠️ Não usar FK de Plan aqui também
        planId: null,
      },
    });

    if (status === 'PAID') {
      const mergedMeta = {
        ...(created.metadata as any),
        ...(metadata as any),
      };

      const durationDays =
        mergedMeta._localPlan?.durationDays ??
        mergedMeta.durationDays ??
        30;

      const expiresAt = new Date(Date.now() + durationDays * 86400000);

      const code = randomBytes(8).toString('hex').toUpperCase();

      await this.prisma.subscription.create({
        data: {
          code,
          status: 'ACTIVE',
          expiresAt,
          telegramUserId: null,
          paymentId: created.id,
          planId: null,
        },
      });
    }

    return { ok: true };
  }

  private generateCode(length = 9) {
    return randomBytes(16).toString('hex').slice(0, length).toUpperCase();
  }

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
      where: {
        OR: [{ id: idOrCode }, { code: idOrCode }],
      },
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


