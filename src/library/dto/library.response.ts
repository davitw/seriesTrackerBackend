import { ApiProperty } from '@nestjs/swagger';

/** Progresso de uma temporada. Sempre derivado no momento da leitura — nunca armazenado. */
export class SeasonProgressDto {
  @ApiProperty({ example: 1 })
  seasonNumber!: number;

  @ApiProperty({ description: 'Episódios conhecidos da temporada.', example: 7 })
  totalEpisodes!: number;

  @ApiProperty({
    description: 'Episódios já liberados (data de estreia não nula e não futura).',
    example: 6,
  })
  airedEpisodes!: number;

  @ApiProperty({ description: 'Episódios marcados como assistidos.', example: 2 })
  watchedEpisodes!: number;

  @ApiProperty({ description: 'Liberados ainda não assistidos.', example: 4 })
  remainingAired!: number;

  @ApiProperty({
    description: 'Episódios sem data conhecida ou com estreia no futuro.',
    example: 1,
  })
  notAired!: number;

  @ApiProperty({
    nullable: true,
    description: 'Próximo episódio a ser liberado, quando houver.',
    example: 7,
  })
  nextEpisodeNumber!: number | null;

  @ApiProperty({ format: 'date', nullable: true, example: '2099-01-01' })
  nextAirDate!: string | null;
}

/** Episódio com o estado de assistido da pessoa autenticada. */
export class EpisodeViewDto {
  @ApiProperty({ format: 'uuid', description: 'Identificador aceito nas rotas de marcação.' })
  episodeId!: string;

  @ApiProperty({ example: 1 })
  seasonNumber!: number;

  @ApiProperty({ example: 1 })
  episodeNumber!: number;

  @ApiProperty({ nullable: true, example: 'Pilot' })
  title!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    description: 'Nulo significa data desconhecida — e episódio desconhecido não é marcável.',
  })
  airDate!: string | null;

  @ApiProperty({ description: 'Se esta pessoa assistiu ao episódio.' })
  watched!: boolean;

  @ApiProperty({ format: 'date-time', nullable: true })
  watchedAt!: string | null;
}

/** Temporada com seus episódios e o progresso derivado. */
export class SeasonViewDto {
  @ApiProperty({ example: 1 })
  seasonNumber!: number;

  @ApiProperty({ nullable: true, example: 'Temporada 1' })
  name!: string | null;

  @ApiProperty({ format: 'date', nullable: true })
  airDate!: string | null;

  @ApiProperty({ type: SeasonProgressDto })
  progress!: SeasonProgressDto;

  @ApiProperty({ type: [EpisodeViewDto] })
  episodes!: EpisodeViewDto[];
}

/** Resposta da marcação de episódio. */
export class EpisodeProgressDto {
  @ApiProperty({ format: 'uuid' })
  episodeId!: string;

  @ApiProperty()
  seasonNumber!: number;

  @ApiProperty()
  episodeNumber!: number;

  @ApiProperty({ description: 'Sempre `true` — a operação é idempotente e sempre resulta marcado.' })
  watched!: boolean;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description: 'Instante da primeira marcação. Repetir a operação não o altera.',
  })
  watchedAt!: string | null;

  @ApiProperty({ format: 'date', nullable: true })
  airDate!: string | null;

  @ApiProperty({
    type: SeasonProgressDto,
    description: 'Progresso da temporada já considerando a operação.',
  })
  seasonProgress!: SeasonProgressDto;
}

/** Série do perfil, com o resumo de progresso. */
export class ProfileSeriesDto {
  @ApiProperty({ format: 'uuid', description: 'Identificador interno usado nas demais rotas.' })
  id!: string;

  @ApiProperty({ example: 1396 })
  externalId!: number;

  @ApiProperty({ example: 'Breaking Bad' })
  title!: string;

  @ApiProperty({ nullable: true })
  posterPath!: string | null;

  @ApiProperty({ format: 'date-time' })
  addedAt!: string;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description: 'Último episódio assistido desta série. Define a ordem das mais recentes.',
  })
  lastWatchedAt!: string | null;

  @ApiProperty({ type: SeasonProgressDto, description: 'Soma das temporadas.' })
  overall!: SeasonProgressDto;

  @ApiProperty({ type: [SeasonProgressDto] })
  seasons!: SeasonProgressDto[];

  @ApiProperty({
    required: false,
    description:
      'Presente apenas na resposta de `POST /v1/series`. `true` significa que a série já ' +
      'estava no perfil e nada foi alterado.',
  })
  alreadyInProfile?: boolean;
}

/** Listagem do perfil, já ordenada pelas mais recentes. */
export class ProfileSeriesListDto {
  @ApiProperty({ type: [ProfileSeriesDto] })
  items!: ProfileSeriesDto[];

  @ApiProperty({ description: 'Total de séries no perfil, independente da paginação.', example: 12 })
  total!: number;
}

/** Série do perfil aberta: episódios por temporada, estado de assistido e progresso. */
export class SeriesDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 1396 })
  externalId!: number;

  @ApiProperty({ example: 'Breaking Bad' })
  title!: string;

  @ApiProperty({ nullable: true })
  overview!: string | null;

  @ApiProperty({ nullable: true })
  posterPath!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Situação no catálogo externo (em exibição, encerrada, cancelada). Informativo.',
    example: 'Ended',
  })
  status!: string | null;

  @ApiProperty({ format: 'date-time' })
  addedAt!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  lastWatchedAt!: string | null;

  @ApiProperty({ type: SeasonProgressDto, description: 'Soma das temporadas.' })
  overall!: SeasonProgressDto;

  @ApiProperty({ type: [SeasonViewDto] })
  seasons!: SeasonViewDto[];
}
