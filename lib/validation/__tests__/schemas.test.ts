import { describe, expect, it } from 'vitest';
import {
  createCommentSchema,
  createFlowerSchema,
  createIncenseSchema,
  createReportSchema,
  listCommentsQuerySchema,
  listHistoryQuerySchema,
} from '../schemas';

describe('createCommentSchema', () => {
  it('accepts `content` field (new spec)', () => {
    const r = createCommentSchema.safeParse({ nickname: 'Alice', content: 'hi' });
    expect(r.success).toBe(true);
  });

  it('accepts legacy `message` field', () => {
    const r = createCommentSchema.safeParse({ message: 'hi' });
    expect(r.success).toBe(true);
  });

  it('rejects when both content and message are missing', () => {
    const r = createCommentSchema.safeParse({ nickname: 'Alice' });
    expect(r.success).toBe(false);
  });

  it('rejects content beyond 500 chars', () => {
    const r = createCommentSchema.safeParse({ content: 'x'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('rejects empty/whitespace content', () => {
    expect(createCommentSchema.safeParse({ content: '   ' }).success).toBe(false);
  });
});

describe('listCommentsQuerySchema', () => {
  it('coerces query strings and applies defaults', () => {
    const r = listCommentsQuerySchema.safeParse({ page: '2', limit: '30' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(2);
      expect(r.data.limit).toBe(30);
    }
  });

  it('treats URLSearchParams missing or empty values as defaults', () => {
    const r = listCommentsQuerySchema.safeParse({ page: '0', limit: null });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ page: 0, limit: 50 });
    }

    const empty = listCommentsQuerySchema.safeParse({ page: '', limit: '' });
    expect(empty.success).toBe(true);
    if (empty.success) {
      expect(empty.data).toEqual({ page: 0, limit: 50 });
    }
  });

  it('rejects negative page and non-positive limit', () => {
    expect(listCommentsQuerySchema.safeParse({ page: '-1' }).success).toBe(false);
    expect(listCommentsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });
});

describe('listHistoryQuerySchema', () => {
  it('defaults missing limit and clamps above the legacy max of 30', () => {
    const missing = listHistoryQuerySchema.safeParse({ page: '0', limit: null });
    expect(missing.success).toBe(true);
    if (missing.success) {
      expect(missing.data).toEqual({ page: 0, limit: 30 });
    }

    const aboveMax = listHistoryQuerySchema.safeParse({ page: '0', limit: '31' });
    expect(aboveMax.success).toBe(true);
    if (aboveMax.success) {
      expect(aboveMax.data.limit).toBe(30);
    }
  });
});

describe('createFlowerSchema', () => {
  it('accepts optional position and deviceToken', () => {
    expect(
      createFlowerSchema.safeParse({
        nickname: 'n',
        position: { x: 1, y: 2, z: 3 },
        deviceToken: 'dt',
      }).success,
    ).toBe(true);
    expect(createFlowerSchema.safeParse({}).success).toBe(true);
  });

  it('rejects NaN coordinates', () => {
    expect(
      createFlowerSchema.safeParse({ position: { x: NaN, y: 0, z: 0 } }).success,
    ).toBe(false);
  });
});

describe('createIncenseSchema', () => {
  it('allows count ∈ {1,3,5} and defaults to 1', () => {
    expect(createIncenseSchema.safeParse({}).success).toBe(true);
    expect(createIncenseSchema.safeParse({ count: 3 }).success).toBe(true);
    expect(createIncenseSchema.safeParse({ count: 5 }).success).toBe(true);
  });

  it('rejects arbitrary integers', () => {
    expect(createIncenseSchema.safeParse({ count: 2 }).success).toBe(false);
    expect(createIncenseSchema.safeParse({ count: 0 }).success).toBe(false);
  });
});

describe('createReportSchema', () => {
  it('accepts target_comment_id or commentId', () => {
    expect(
      createReportSchema.safeParse({ target_comment_id: 1, reason: 'spam' }).success,
    ).toBe(true);
    expect(
      createReportSchema.safeParse({ commentId: 1, reason: 'spam' }).success,
    ).toBe(true);
  });

  it('allows report without a target comment id', () => {
    expect(createReportSchema.safeParse({ reason: 'abuse' }).success).toBe(true);
  });

  it('rejects empty reason', () => {
    expect(createReportSchema.safeParse({ reason: '   ' }).success).toBe(false);
  });
});
