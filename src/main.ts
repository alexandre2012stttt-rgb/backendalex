import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, raw } from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // RAW APENAS no webhook
  app.use('/pix/webhook', raw({ type: '*/*' }));

  // JSON normal para todas as outras rotas
  app.use(json());
  app.use(
    raw({
      type: () => false, // impede raw de sobrescrever JSON
    })
  );

  app.enableCors({
    origin: '*',
    methods: 'GET,POST,PUT,DELETE',
  });

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
