import { JwtService } from '@nestjs/jwt';
import { TokenService } from '../../src/auth/token.service';

/** T024 — credencial de acesso e de renovação (FR-002, R-004). */
describe('TokenService', () => {
  const secret = 'x'.repeat(48);
  const service = new TokenService(new JwtService({ secret }));

  it('emite access token com o identificador da pessoa', () => {
    const token = service.issueAccessToken('user-1', 'ana@example.com');
    const payload = service.verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('ana@example.com');
    expect(payload.exp! - payload.iat!).toBe(900);
  });

  it('recusa access token assinado com outro segredo', () => {
    const outro = new TokenService(new JwtService({ secret: 'y'.repeat(48) }));
    const token = outro.issueAccessToken('user-1', 'ana@example.com');
    expect(() => service.verifyAccessToken(token)).toThrow();
  });

  it('recusa access token expirado', () => {
    const expired = new TokenService(new JwtService({ secret }), { accessTtlSeconds: -10 });
    const token = expired.issueAccessToken('user-1', 'ana@example.com');
    expect(() => service.verifyAccessToken(token)).toThrow();
  });

  it('gera credencial de renovação opaca e guarda apenas o hash', () => {
    const { value, hash } = service.generateRefreshToken();
    expect(value).toHaveLength(64);
    expect(hash).not.toBe(value);
    expect(hash).toBe(service.hashRefreshToken(value));
    expect(hash).toHaveLength(64);
  });

  it('a validade de renovação é de 30 dias corridos', () => {
    const now = new Date('2026-09-23T12:00:00.000Z');
    const expiry = service.refreshExpiryFrom(now);
    const days = (expiry.getTime() - now.getTime()) / 86_400_000;
    expect(days).toBe(30);
  });
});
