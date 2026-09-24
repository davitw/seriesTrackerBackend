import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { PasswordHasher } from './password.hasher';
import { TokenService } from './token.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
    // Limitação de taxa das rotas públicas (FR-021). O limite é por origem e por janela.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get('AUTH_RATE_LIMIT_TTL') ?? 60) * 1000,
          limit: Number(config.get('AUTH_RATE_LIMIT_MAX') ?? 10),
        },
      ],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    PasswordHasher,
    JwtStrategy,
    JwtAuthGuard,
    {
      provide: TokenService,
      useFactory: (jwt: JwtService) => new TokenService(jwt),
      inject: [JwtService],
    },
  ],
  exports: [JwtAuthGuard, TokenService],
})
export class AuthModule {}
