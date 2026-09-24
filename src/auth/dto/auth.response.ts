import { ApiProperty } from '@nestjs/swagger';

/** Resposta de autenticação: o par de credenciais e sua validade. */
export class AuthSessionDto {
  @ApiProperty({
    description: 'Credencial de acesso. Envie como `Authorization: Bearer <valor>`.',
  })
  accessToken!: string;

  @ApiProperty({
    description:
      'Credencial de renovação, de uso único. Guarde-a: reapresentar uma já usada encerra ' +
      'todas as sessões da conta.',
  })
  refreshToken!: string;

  @ApiProperty({ enum: ['Bearer'], example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ description: 'Validade da credencial de acesso, em segundos.', example: 900 })
  expiresIn!: number;
}

/** Perfil da pessoa autenticada. */
export class UserProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email', example: 'ana@example.com' })
  email!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
