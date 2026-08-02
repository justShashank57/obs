import { describe, it, expect } from 'vitest';
import { isValidClientId } from './validateClientId.js';

describe('isValidClientId', () => {
  it('accepts simple lowercase/number/hyphen ids', () => {
    expect(isValidClientId('demo')).toBe(true);
    expect(isValidClientId('client-123')).toBe(true);
  });

  it('rejects path traversal attempts', () => {
    expect(isValidClientId('../../etc/passwd')).toBe(false);
    expect(isValidClientId('..%2f..%2fetc')).toBe(false);
    expect(isValidClientId('a/b')).toBe(false);
  });

  it('rejects non-strings, empty strings, and uppercase', () => {
    expect(isValidClientId('')).toBe(false);
    expect(isValidClientId(null)).toBe(false);
    expect(isValidClientId(undefined)).toBe(false);
    expect(isValidClientId(123)).toBe(false);
    expect(isValidClientId('DemoClient')).toBe(false);
  });
});
