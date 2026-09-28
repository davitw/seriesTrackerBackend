import { ApiProperty } from '@nestjs/swagger';

/** Item de uma lista de destaques. */
export class CatalogListItemDto {
  @ApiProperty({
    description:
      'Identificador no catálogo externo. É o valor aceito em `POST /v1/series` — adicionar ' +
      'a partir daqui resulta em episódios disponíveis.',
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

  @ApiProperty({ nullable: true, description: 'Caminho relativo da imagem no provedor.' })
  posterPath!: string | null;
}

/** Lista de destaques, com identificação própria. */
export class CatalogListDto {
  @ApiProperty({
    description: 'Identificador estável da lista.',
    enum: ['popular', 'on_the_air', 'top_rated'],
    example: 'popular',
  })
  key!: string;

  @ApiProperty({ description: 'Rótulo legível, pronto para exibição.', example: 'Populares' })
  name!: string;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description:
      'Quando o conteúdo foi obtido do provedor pela última vez. `null` só aparece se a ' +
      'lista nunca foi sincronizada — caso em que a resposta foi buscada ao vivo.',
  })
  updatedAt!: string | null;

  @ApiProperty({
    type: [CatalogListItemDto],
    description: 'Pode ser vazia — ausência de destaques não é erro.',
  })
  items!: CatalogListItemDto[];
}

/** Resposta da home: todas as listas de uma vez. */
export class DiscoverResponseDto {
  @ApiProperty({ type: [CatalogListDto] })
  lists!: CatalogListDto[];
}
