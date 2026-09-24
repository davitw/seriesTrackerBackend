import { Controller, Delete, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '../auth/auth.service';
import { UserProfileDto } from '../auth/dto/auth.response';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ErrorResponseDto } from '../common/errors/error-response.dto';
import { UsersService } from './users.service';

@ApiTags('account')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Consultar o próprio perfil' })
  @ApiResponse({ status: 200, description: 'Perfil da pessoa autenticada.', type: UserProfileDto })
  @ApiResponse({
    status: 401,
    description: 'Sessão ausente, inválida ou expirada (`UNAUTHENTICATED`).',
    type: ErrorResponseDto,
  })
  getProfile(): Promise<UserProfile> {
    return this.users.getProfile();
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Encerrar a conta',
    description:
      'Remove a conta e, em cascata, perfil, progresso e **todas as sessões ativas** — ' +
      'inclusive as abertas em outro dispositivo. Não há desfazer.',
  })
  @ApiResponse({ status: 204, description: 'Conta encerrada.' })
  @ApiResponse({ status: 401, description: 'Sessão inválida.', type: ErrorResponseDto })
  async deleteAccount(): Promise<void> {
    await this.users.deleteAccount();
  }
}
