import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma'; // IMPORTA DO CLIENT GERADO

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // Prisma 7 NAO USA MAIS $connect()
    await this.$transaction([]); // força inicialização segura
  }

  async onModuleDestroy() {
    // Prisma 7 NAO USA MAIS $disconnect()
    await this.$disconnect();
  }
}
