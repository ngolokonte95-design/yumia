import { Global, Module } from '@nestjs/common';
import { QuotaInterceptor } from './quota.interceptor';
import { QuotaService } from './quota.service';

/** Quotas quotidiens côté serveur — global, pour `@Quota` dans tout module. */
@Global()
@Module({
  providers: [QuotaService, QuotaInterceptor],
  exports: [QuotaService, QuotaInterceptor],
})
export class QuotaModule {}
