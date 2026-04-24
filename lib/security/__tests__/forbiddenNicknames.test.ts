import { describe, expect, it } from 'vitest';
import { isNicknameForbidden } from '../forbiddenNicknames';

describe('isNicknameForbidden', () => {
  it('flags Korean administrative roles', () => {
    expect(isNicknameForbidden('관리자')).toBe(true);
    expect(isNicknameForbidden('운영자')).toBe(true);
    expect(isNicknameForbidden('사이트관리자')).toBe(true);
  });

  it('flags English administrative roles case-insensitively', () => {
    expect(isNicknameForbidden('Admin')).toBe(true);
    expect(isNicknameForbidden('MODERATOR')).toBe(true);
    expect(isNicknameForbidden('system')).toBe(true);
    expect(isNicknameForbidden('x-operator-y')).toBe(true);
  });

  it('allows ordinary nicknames', () => {
    expect(isNicknameForbidden('익명의 개발자')).toBe(false);
    expect(isNicknameForbidden('Alice')).toBe(false);
    expect(isNicknameForbidden('백준팬')).toBe(false);
    expect(isNicknameForbidden('')).toBe(false);
  });
});
