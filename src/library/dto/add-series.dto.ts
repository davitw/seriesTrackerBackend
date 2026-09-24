import { IsInt, Min } from 'class-validator';

export class AddSeriesDto {
  @IsInt({ message: 'Informe o identificador da série no catálogo.' })
  @Min(1)
  externalId!: number;
}
