import { ValidationError } from '@nestjs/common';
import { DomainError, ErrorCode } from './error-codes';

/**
 * Converte os erros do `ValidationPipe` no mapa `campo → motivo`.
 *
 * A chave vem da **propriedade** do erro, nunca do texto da mensagem: com mensagens
 * customizadas ("A senha deve ter no mínimo 6 caracteres."), a primeira palavra não tem
 * nenhuma relação com o nome do campo.
 */
export function toFieldMap(
  errors: ValidationError[],
  prefix = '',
): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;

    if (error.constraints) {
      fields[path] = Object.values(error.constraints).join('; ');
    }

    if (error.children && error.children.length > 0) {
      Object.assign(fields, toFieldMap(error.children, path));
    }
  }

  return fields;
}

/** Fábrica usada pelo pipe global: dado inválido responde 422 com os campos em falta. */
export const validationExceptionFactory = (errors: ValidationError[]): DomainError =>
  new DomainError(ErrorCode.VALIDATION_ERROR, 'Dados inválidos.', 422, {
    fields: toFieldMap(errors),
  });
