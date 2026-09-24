import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UserScope } from './user-scope';
import { UserScopeInterceptor } from './user-scope.interceptor';

@Global()
@Module({
  providers: [PrismaService, UserScope, UserScopeInterceptor],
  exports: [PrismaService, UserScope, UserScopeInterceptor],
})
export class DatabaseModule {}
