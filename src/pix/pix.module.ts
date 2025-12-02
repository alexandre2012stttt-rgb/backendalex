// src/pix/pix.module.ts
import { Module } from '@nestjs/common';
import { PixController } from './pix.controller';
import { PixWebhookController } from './pix.webhook.controller';
import { PixService } from './pix.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PixController, PixWebhookController],
  providers: [PixService],
})
export class PixModule {}
