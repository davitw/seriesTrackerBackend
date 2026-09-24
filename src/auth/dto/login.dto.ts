import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'E-mail cadastrado. A resposta de recusa é a mesma para e-mail inexistente.',
    example: 'ana@example.com',
  })
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;

  @ApiProperty({ description: 'Senha da conta.', example: 'segredo123' })
  @IsString()
  @MinLength(1, { message: 'Informe a senha.' })
  password!: string;
}
