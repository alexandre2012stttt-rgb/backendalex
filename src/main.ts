import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, raw } from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // RAW APENAS para o webhook WiinPay
  app.use('/pix/webhook', raw({ type: '*/*' }));

  // JSON normal para todas as outras rotas
  app.use(json({ limit: '10mb' }));

  // ❗ Remover completamente qualquer raw secundário
  // (este era o que estava bloqueando o JSON)
  // app.use(raw({ type: () => false }));

  app.enableCors({
    origin: '*',
    methods: 'GET,POST,PUT,DELETE',
  });

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
