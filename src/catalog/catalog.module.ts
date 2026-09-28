import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogController } from './catalog.controller';
import { CatalogListsRepository } from './catalog.lists.repository';
import { CatalogListsService } from './catalog.lists.service';
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
    CatalogListsRepository,
    CatalogListsService,
    CatalogSyncJob,
    { provide: CATALOG_HTTP_CLIENT, useClass: TmdbHttpClient },
  ],
  exports: [CatalogService, CatalogRepository, CatalogListsRepository, CatalogListsService],
})
export class CatalogModule {}
