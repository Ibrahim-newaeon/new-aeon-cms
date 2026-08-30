// tests/content-permissions.test.ts
import { describe, it, expect } from 'vitest';
import {
  canPublish, canEdit, checkStatusChange, resolveAuthorId,
} from '@/lib/content/permissions';

const AUTHOR = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';

describe('canPublish', () => {
  it('is an editorial act, not an authoring one', () => {
    expect(canPublish('admin')).toBe(true);
    expect(canPublish('editor')).toBe(true);
    expect(canPublish('author')).toBe(false);
  });
});

describe('canEdit', () => {
  it('lets an author touch only their own work', () => {
    expect(canEdit('author', AUTHOR, AUTHOR)).toBe(true);
    expect(canEdit('author', OTHER, AUTHOR)).toBe(false);
    // Content with no recorded author is not therefore everyone's.
    expect(canEdit('author', null, AUTHOR)).toBe(false);
  });

  it('lets editors and admins work on anything', () => {
    expect(canEdit('editor', OTHER, AUTHOR)).toBe(true);
    expect(canEdit('admin', null, AUTHOR)).toBe(true);
  });
});

describe('checkStatusChange', () => {
  it('refuses rather than quietly saving an author’s publish as a draft', () => {
    // Silently downgrading tells someone their page is live when it is not.
    expect(checkStatusChange('author', 'published', 'draft')).toEqual({
      ok: false,
      reason: 'cannot-publish',
    });
  });

  it('lets an author save and re-save a draft', () => {
    expect(checkStatusChange('author', 'draft', null)).toEqual({ ok: true });
    expect(checkStatusChange('author', 'draft', 'draft')).toEqual({ ok: true });
  });

  it('will not let an author pull a live page down', () => {
    // Taking something off the site is as editorial as putting it up, and this
    // is reachable for an author who owns a post an editor published.
    expect(checkStatusChange('author', 'draft', 'published')).toEqual({
      ok: false,
      reason: 'cannot-unpublish',
    });
    expect(checkStatusChange('author', 'archived', 'draft')).toEqual({
      ok: false,
      reason: 'cannot-unpublish',
    });
  });

  it('does not restrict editors or admins', () => {
    for (const role of ['admin', 'editor'] as const) {
      expect(checkStatusChange(role, 'published', 'draft')).toEqual({ ok: true });
      expect(checkStatusChange(role, 'archived', 'published')).toEqual({ ok: true });
    }
  });
});

describe('resolveAuthorId', () => {
  it('ignores an author’s attempt to credit someone else', () => {
    // authorId was an optional body field the server took on trust.
    expect(resolveAuthorId('author', OTHER, AUTHOR)).toBe(AUTHOR);
  });

  it('lets an editor assign authorship, which is a real need', () => {
    expect(resolveAuthorId('editor', OTHER, AUTHOR)).toBe(OTHER);
  });

  it('falls back to the session when nothing is requested', () => {
    expect(resolveAuthorId('editor', undefined, AUTHOR)).toBe(AUTHOR);
    expect(resolveAuthorId('author', undefined, AUTHOR)).toBe(AUTHOR);
  });
});
