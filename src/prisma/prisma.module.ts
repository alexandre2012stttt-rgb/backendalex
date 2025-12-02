import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { PixModule } from './pix/pix.module';

@Module({
  imports: [PrismaModule, PixModule],
})
export class AppModule {}
