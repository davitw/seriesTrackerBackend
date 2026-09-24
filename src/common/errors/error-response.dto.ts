import { ApiProperty } from '@nestjs/swagger';

/**
 * Formato único de erro da API.
 *
 * Existe como classe — e não como texto solto em cada endpoint — para que o corpo do erro
 * apareça de fato na documentação. O catálogo completo dos códigos está em
 * `specs/001-series-tracking/contracts/errors.md`.
 */
export class ErrorBodyDto {
  @ApiProperty({
    description: 'Código estável e não traduzido. É o que o cliente deve interpretar.',
    example: 'EMAIL_ALREADY_REGISTERED',
  })
  code!: string;

  @ApiProperty({
    description: 'Mensagem legível para exibição. Nunca contém dado sensível.',
    example: 'Este e-mail já está cadastrado.',
  })
  message!: string;

  @ApiProperty({
    required: false,
    description:
      'Contexto adicional do erro, quando existe. Exemplos: `fields` (campos inválidos) ' +
      'em VALIDATION_ERROR; `airDate` em EPISODE_NOT_AIRED.',
    example: { airDate: '2026-10-04' },
    type: Object,
    additionalProperties: true,
  })
  details?: Record<string, unknown>;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;
}
