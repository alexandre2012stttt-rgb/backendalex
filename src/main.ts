import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, raw } from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // <-- ESSENCIAL PARA WEBHOOK
  });

  // Body-parser para Webhook WiinPay
  app.use(raw({ type: '*/*' }));
  app.use(json());

  app.enableCors({
    origin: '*', // coloque seu domínio depois
    methods: 'GET,POST,PUT,DELETE',
  });

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
