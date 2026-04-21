import { describe, expect, it } from 'vitest';

import { escapeHtml } from '../escapeHtml';

describe('escapeHtml', () => {
  it('matches the legacy server-side HTML escaping contract', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">&')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;',
    );
  });
});
