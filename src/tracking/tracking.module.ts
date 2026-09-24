import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LibraryModule } from '../library/library.module';
import { EpisodeAvailabilityService } from './episode-availability.service';
import { TrackingController } from './tracking.controller';
import { TrackingRepository } from './tracking.repository';
import { TrackingService } from './tracking.service';

@Module({
  // Depende do LibraryModule apenas pelo vínculo série ↔ perfil, que é atualizado
  // quando um episódio é marcado.
  imports: [AuthModule, LibraryModule],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingRepository, EpisodeAvailabilityService],
})
export class TrackingModule {}
