import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    // PRISMA 7 NÃO USA MAIS $connect()
    await this.$transaction([]); 
  }

  async onModuleDestroy() {
    // PRISMA 7 NÃO USA MAIS $disconnect()
    await this.$disconnect();
  }
}
