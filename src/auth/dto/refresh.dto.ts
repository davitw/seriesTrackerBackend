import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({
    description:
      'Credencial de renovação recebida no login. A cada uso o serviço devolve uma nova e ' +
      'invalida a anterior; reapresentar uma já usada encerra todas as sessões da conta.',
    example: 'a1b2c3d4e5f6…',
  })
  @IsString()
  @MinLength(1, { message: 'Informe a credencial de renovação.' })
  refreshToken!: string;
}
