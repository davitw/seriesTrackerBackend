import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogController } from './catalog.controller';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';
import { CATALOG_HTTP_CLIENT } from './catalog.tokens';
import { CatalogSyncJob } from './catalog.sync.job';
import { TmdbAdapter } from './tmdb.adapter';
import { TmdbHttpClient } from './tmdb.http-client';

@Module({
  imports: [AuthModule],
  controllers: [CatalogController],
  providers: [
    TmdbAdapter,
    CatalogRepository,
    CatalogService,
    CatalogSyncJob,
    { provide: CATALOG_HTTP_CLIENT, useClass: TmdbHttpClient },
  ],
  exports: [CatalogService, CatalogRepository],
})
export class CatalogModule {}
