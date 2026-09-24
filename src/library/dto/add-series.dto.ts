import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class AddSeriesDto {
  @ApiProperty({
    description:
      'Identificador da série no catálogo externo (devolvido pela busca). Adicionar a mesma ' +
      'série duas vezes não cria duplicata e não apaga o progresso existente.',
    example: 1396,
  })
  @IsInt({ message: 'Informe o identificador da série no catálogo.' })
  @Min(1)
  externalId!: number;
}
