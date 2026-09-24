import { PasswordHasher } from '../../src/auth/password.hasher';

/** T023 — hash de senha (FR-001). */
describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('nunca guarda a senha em claro', async () => {
    const hash = await hasher.hash('segredo123');
    expect(hash).not.toContain('segredo123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('usa parâmetros de custo explícitos, não o padrão da biblioteca', async () => {
    const hash = await hasher.hash('segredo123');
    expect(hash).toContain('m=19456');
    expect(hash).toContain('t=2,p=1');
  });

  it('aceita a senha correta', async () => {
    const hash = await hasher.hash('segredo123');
    await expect(hasher.verify(hash, 'segredo123')).resolves.toBe(true);
  });

  it('recusa a senha incorreta', async () => {
    const hash = await hasher.hash('segredo123');
    await expect(hasher.verify(hash, 'segredo124')).resolves.toBe(false);
  });

  it('recusa senha com menos de 6 caracteres', () => {
    expect(() => hasher.assertStrong('12345')).toThrow();
    expect(() => hasher.assertStrong('123456')).not.toThrow();
  });
});
