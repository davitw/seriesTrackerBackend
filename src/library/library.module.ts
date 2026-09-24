import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { LibraryController } from './library.controller';
import { LibraryRepository } from './library.repository';
import { LibraryService } from './library.service';

@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [LibraryController],
  providers: [LibraryService, LibraryRepository],
  exports: [LibraryService, LibraryRepository],
})
export class LibraryModule {}
