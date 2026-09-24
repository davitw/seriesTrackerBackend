import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description:
      'E-mail da conta. Único no sistema, comparado sem diferenciar maiúsculas de minúsculas.',
    example: 'ana@example.com',
  })
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;

  @ApiProperty({
    description: 'Senha da conta. Armazenada apenas como hash (argon2id).',
    example: 'segredo123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres.' })
  password!: string;
}
