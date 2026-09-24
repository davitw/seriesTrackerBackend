import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ErrorResponseDto } from '../common/errors/error-response.dto';
import { AuthService, AuthSession, UserProfile } from './auth.service';
import { AuthSessionDto, UserProfileDto } from './dto/auth.response';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Criar conta com e-mail e senha',
    description:
      'A recusa por e-mail já cadastrado é explícita — decisão consciente do produto, ' +
      'mitigada pela limitação de taxa desta rota. A senha deve ter no mínimo 6 caracteres.',
  })
  @ApiResponse({ status: 201, description: 'Conta criada.', type: UserProfileDto })
  @ApiResponse({
    status: 409,
    description: 'E-mail já cadastrado (`EMAIL_ALREADY_REGISTERED`).',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 422,
    description: 'Dados inválidos (`VALIDATION_ERROR`) — `details.fields` indica os campos.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 429,
    description: 'Excesso de requisições nesta origem (`RATE_LIMITED`).',
    type: ErrorResponseDto,
  })
  register(@Body() dto: RegisterDto): Promise<UserProfile> {
    return this.auth.register(dto.email, dto.password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Entrar com e-mail e senha',
    description:
      'A recusa é idêntica para e-mail inexistente e senha incorreta, e consome o mesmo ' +
      'tempo — a resposta não revela se a conta existe.',
  })
  @ApiResponse({ status: 200, description: 'Autenticado.', type: AuthSessionDto })
  @ApiResponse({
    status: 401,
    description: 'Credenciais inválidas (`INVALID_CREDENTIALS`).',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 422, description: 'Dados inválidos.', type: ErrorResponseDto })
  @ApiResponse({
    status: 429,
    description: 'Excesso de requisições nesta origem (`RATE_LIMITED`).',
    type: ErrorResponseDto,
  })
  login(@Body() dto: LoginDto): Promise<AuthSession> {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar a sessão',
    description:
      'Rotação: a credencial apresentada é invalidada e uma nova é emitida, com novo prazo ' +
      'de 30 dias. Reapresentar uma credencial já rotacionada encerra todas as sessões da conta.',
  })
  @ApiResponse({ status: 200, description: 'Sessão renovada.', type: AuthSessionDto })
  @ApiResponse({
    status: 401,
    description: 'Credencial inválida, expirada ou já usada (`INVALID_REFRESH_TOKEN`).',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 422, description: 'Dados inválidos.', type: ErrorResponseDto })
  refresh(@Body() dto: RefreshDto): Promise<AuthSession> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sair da conta',
    description: 'Revoga a credencial de renovação apresentada. É idempotente.',
  })
  @ApiResponse({ status: 204, description: 'Sessão encerrada.' })
  @ApiResponse({ status: 422, description: 'Dados inválidos.', type: ErrorResponseDto })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }
}
