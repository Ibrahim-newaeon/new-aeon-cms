import { describe, it, expect } from 'vitest';
// Type-only, so it is erased and does not load the module before the env var
// below is in place.
import type { CartCookie } from '@/lib/commerce/cart';

// The module reads JWT_ACCESS_SECRET at import time for cookie signing.
process.env.JWT_ACCESS_SECRET ||= 'test-secret-at-least-32-characters-long';

const { addLine, setLineQty, MAX_LINES } = await import('@/lib/commerce/cart');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const cart = (...lines: { variantId: string; qty: number }[]): CartCookie => ({ lines });

/**
 * The cookie holds only variant ids and quantities — never prices. These test
 * the shape of that payload; what a customer is actually charged is re-read
 * from the database by priceCart on every request.
 */
describe('addLine', () => {
  it('appends a new line', () => {
    expect(addLine(cart(), A, 2).lines).toEqual([{ variantId: A, qty: 2 }]);
  });

  it('accumulates onto an existing line rather than duplicating it', () => {
    const result = addLine(cart({ variantId: A, qty: 2 }), A, 3);
    expect(result.lines).toEqual([{ variantId: A, qty: 5 }]);
  });

  it('leaves other lines untouched', () => {
    const result = addLine(cart({ variantId: A, qty: 1 }, { variantId: B, qty: 4 }), A, 1);
    expect(result.lines).toEqual([{ variantId: A, qty: 2 }, { variantId: B, qty: 4 }]);
  });

  it('clamps to 99 per line', () => {
    expect(addLine(cart(), A, 500).lines[0]!.qty).toBe(99);
    expect(addLine(cart({ variantId: A, qty: 98 }), A, 50).lines[0]!.qty).toBe(99);
  });

  it('never adds a line below quantity 1', () => {
    expect(addLine(cart(), A, 0).lines[0]!.qty).toBe(1);
    expect(addLine(cart(), A, -5).lines[0]!.qty).toBe(1);
  });

  it('refuses to grow past the line cap, but still tops up an existing line', () => {
    const full = cart(
      ...Array.from({ length: MAX_LINES }, (_, i) => ({
        variantId: `${i}`.padStart(8, '0') + '-0000-4000-8000-000000000000',
        qty: 1,
      }))
    );

    expect(addLine(full, A, 1).lines).toHaveLength(MAX_LINES);

    const existing = full.lines[0]!.variantId;
    expect(addLine(full, existing, 1).lines.find((l) => l.variantId === existing)!.qty).toBe(2);
  });

  it('does not mutate the cart it is given', () => {
    const original = cart({ variantId: A, qty: 1 });
    const snapshot = JSON.parse(JSON.stringify(original));
    addLine(original, A, 5);
    expect(original).toEqual(snapshot);
  });
});

describe('setLineQty', () => {
  it('sets an exact quantity', () => {
    expect(setLineQty(cart({ variantId: A, qty: 1 }), A, 7).lines[0]!.qty).toBe(7);
  });

  it('removes the line at zero or below — this is how the UI deletes', () => {
    expect(setLineQty(cart({ variantId: A, qty: 3 }), A, 0).lines).toEqual([]);
    expect(setLineQty(cart({ variantId: A, qty: 3 }), A, -1).lines).toEqual([]);
  });

  it('removes only the targeted line', () => {
    const result = setLineQty(cart({ variantId: A, qty: 1 }, { variantId: B, qty: 2 }), A, 0);
    expect(result.lines).toEqual([{ variantId: B, qty: 2 }]);
  });

  it('clamps to 99', () => {
    expect(setLineQty(cart({ variantId: A, qty: 1 }), A, 1000).lines[0]!.qty).toBe(99);
  });

  it('is a no-op for a variant not in the cart', () => {
    const before = cart({ variantId: A, qty: 1 });
    expect(setLineQty(before, B, 5).lines).toEqual(before.lines);
  });

  it('does not mutate the cart it is given', () => {
    const original = cart({ variantId: A, qty: 1 });
    const snapshot = JSON.parse(JSON.stringify(original));
    setLineQty(original, A, 9);
    expect(original).toEqual(snapshot);
  });
});
