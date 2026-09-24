import { ApiProperty } from '@nestjs/swagger';

/** Correspondência de busca no catálogo externo. */
export class CatalogSeriesSummaryDto {
  @ApiProperty({
    description: 'Identificador no catálogo externo. É o valor aceito em `POST /v1/series`.',
    example: 1396,
  })
  externalId!: number;

  @ApiProperty({ example: 'Breaking Bad' })
  title!: string;

  @ApiProperty({
    format: 'date',
    nullable: true,
    description: 'Data de estreia, para distinguir séries homônimas.',
    example: '2008-01-20',
  })
  firstAirDate!: string | null;

  @ApiProperty({ nullable: true })
  overview!: string | null;

  @ApiProperty({ nullable: true, description: 'Caminho relativo da imagem no provedor.' })
  posterPath!: string | null;
}

export class CatalogSearchResponseDto {
  @ApiProperty({
    type: [CatalogSeriesSummaryDto],
    description: 'Pode ser vazia: ausência de resultado não é erro.',
  })
  items!: CatalogSeriesSummaryDto[];
}
