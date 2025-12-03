// src/pix/pix.module.ts
import { Module } from '@nestjs/common';
import { PixController } from './pix.controller';
import { PixWebhookController } from './pix.webhook.controller';
import { PixService } from './pix.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [PixController, PixWebhookController],
  providers: [PixService, PrismaService],
})
export class PixModule {}
