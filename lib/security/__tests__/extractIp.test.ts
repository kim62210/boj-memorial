import { describe, expect, it } from 'vitest';
import { extractIp, extractIpFromRequest } from '../extractIp';

describe('extractIp', () => {
  it('returns the trimmed left-most entry from x-forwarded-for', () => {
    expect(extractIp('203.0.113.42, 10.0.0.1', '127.0.0.1')).toBe('203.0.113.42');
    expect(extractIp(' 203.0.113.42 ', '127.0.0.1')).toBe('203.0.113.42');
  });

  it('falls back when header is missing or empty', () => {
    expect(extractIp(undefined, '127.0.0.1')).toBe('127.0.0.1');
    expect(extractIp(null, '10.0.0.1')).toBe('10.0.0.1');
    expect(extractIp('', '10.0.0.1')).toBe('10.0.0.1');
    expect(extractIp(', 10.0.0.1', '10.0.0.1')).toBe('10.0.0.1');
  });

  it('returns "unknown" when both inputs are absent', () => {
    expect(extractIp(undefined, undefined)).toBe('unknown');
  });
});

describe('extractIpFromRequest', () => {
  it('prefers x-forwarded-for over x-real-ip', () => {
    const req = new Request('http://localhost/', {
      headers: {
        'x-forwarded-for': '198.51.100.7, 10.0.0.1',
        'x-real-ip': '10.0.0.1',
      },
    });
    expect(extractIpFromRequest(req)).toBe('198.51.100.7');
  });

  it('falls back to x-real-ip when x-forwarded-for is missing', () => {
    const req = new Request('http://localhost/', {
      headers: { 'x-real-ip': '10.0.0.5' },
    });
    expect(extractIpFromRequest(req)).toBe('10.0.0.5');
  });

  it('returns "unknown" when no headers are present', () => {
    const req = new Request('http://localhost/');
    expect(extractIpFromRequest(req)).toBe('unknown');
  });
});
