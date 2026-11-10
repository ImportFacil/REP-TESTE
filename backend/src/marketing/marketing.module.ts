import { Module } from '@nestjs/common';
import { MarketingController, NewsletterController } from './marketing.controller';
import { MarketingService } from './marketing.service';

/** Marketing no formato do Bagisto: promoções e cupons, newsletter, modelos de e-mail e caixa de saída. */
@Module({ providers: [MarketingService], controllers: [MarketingController, NewsletterController], exports: [MarketingService] })
export class MarketingModule {}
