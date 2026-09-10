import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AliExpressService } from './aliexpress.service';
import { CartService } from './cart.service';
import { CatalogService } from './catalog.service';
import { GiftService } from './gift.service';
import { OrdersService } from './orders.service';
import { ShopController } from './shop.controller';
import { ShopImportService } from './shop-import.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ShopController],
  providers: [AliExpressService, CatalogService, CartService, GiftService, OrdersService, ShopImportService],
  exports: [CatalogService],
})
export class ShopModule {}
