import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PixModule } from './pix/pix.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,        // <-- ESSENCIAL, agora todas variáveis do .env funcionam
      envFilePath: '.env',   // <-- garante que o .env seja lido
    }),

    PrismaModule,
    PixModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
