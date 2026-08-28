import { describe, it, expect } from 'vitest';
import {
  ORDER_STATUSES,
  canTransition,
  nextStatuses,
  restoresStock,
  notifiesCustomer,
  isOrderStatus,
  STATUS_LABEL,
  STATUS_TONE,
  PAYMENT_STATUSES,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  type OrderStatus,
} from '@/lib/commerce/order-status';

/**
 * The state machine is the thing standing between a mis-click and a corrupted
 * order history, so it is worth pinning down exhaustively rather than by
 * example.
 */
describe('order state machine', () => {
  it('allows exactly the intended forward moves', () => {
    expect(nextStatuses('pending')).toEqual(['confirmed', 'cancelled']);
    expect(nextStatuses('confirmed')).toEqual(['processing', 'cancelled']);
    expect(nextStatuses('processing')).toEqual(['shipped', 'cancelled']);
    expect(nextStatuses('shipped')).toEqual(['delivered', 'cancelled']);
    expect(nextStatuses('delivered')).toEqual(['refunded']);
  });

  it('treats cancelled and refunded as terminal', () => {
    expect(nextStatuses('cancelled')).toEqual([]);
    expect(nextStatuses('refunded')).toEqual([]);
  });

  it('never allows a status to transition to itself', () => {
    // Self-transition is what would let a second cancel restore stock twice.
    for (const s of ORDER_STATUSES) {
      expect(canTransition(s, s)).toBe(false);
    }
  });

  it('never allows moving backwards through fulfilment', () => {
    const order: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < i; j++) {
        expect(canTransition(order[i]!, order[j]!)).toBe(false);
      }
    }
  });

  it('never allows skipping a fulfilment step', () => {
    expect(canTransition('pending', 'processing')).toBe(false);
    expect(canTransition('pending', 'shipped')).toBe(false);
    expect(canTransition('pending', 'delivered')).toBe(false);
    expect(canTransition('confirmed', 'shipped')).toBe(false);
    expect(canTransition('confirmed', 'delivered')).toBe(false);
    expect(canTransition('processing', 'delivered')).toBe(false);
  });

  it('allows cancelling at any point before delivery, and never after', () => {
    for (const s of ['pending', 'confirmed', 'processing', 'shipped'] as const) {
      expect(canTransition(s, 'cancelled')).toBe(true);
    }
    expect(canTransition('delivered', 'cancelled')).toBe(false);
    expect(canTransition('refunded', 'cancelled')).toBe(false);
  });

  it('only allows a refund from delivered', () => {
    for (const s of ORDER_STATUSES) {
      expect(canTransition(s, 'refunded')).toBe(s === 'delivered');
    }
  });

  it('rejects unknown statuses rather than throwing', () => {
    expect(canTransition('nonsense' as OrderStatus, 'confirmed')).toBe(false);
    expect(nextStatuses('nonsense' as OrderStatus)).toEqual([]);
  });

  it('reaches every non-initial status by some legal path', () => {
    // Guards against a status being defined but stranded — unreachable in the
    // UI while still accepted by the enum.
    const reachable = new Set<OrderStatus>(['pending']);
    let grew = true;

    while (grew) {
      grew = false;
      for (const from of [...reachable]) {
        for (const to of nextStatuses(from)) {
          if (!reachable.has(to)) {
            reachable.add(to);
            grew = true;
          }
        }
      }
    }

    for (const s of ORDER_STATUSES) expect(reachable.has(s)).toBe(true);
  });
});

describe('stock restoration', () => {
  it('restores only on cancelled and refunded', () => {
    for (const s of ORDER_STATUSES) {
      expect(restoresStock(s)).toBe(s === 'cancelled' || s === 'refunded');
    }
  });

  it('restoring statuses are terminal, which is what makes it a once-only event', () => {
    // If a restoring status could be left and re-entered, stock would be
    // returned twice for one order.
    for (const s of ORDER_STATUSES) {
      if (restoresStock(s)) expect(nextStatuses(s)).toEqual([]);
    }
  });
});

describe('customer notification', () => {
  it('notifies on the four transitions a customer cares about', () => {
    expect(notifiesCustomer('confirmed')).toBe(true);
    expect(notifiesCustomer('shipped')).toBe(true);
    expect(notifiesCustomer('delivered')).toBe(true);
    expect(notifiesCustomer('cancelled')).toBe(true);
  });

  it('stays quiet for internal movement', () => {
    // `processing` means the shop picked the box off a shelf. Mailing about it
    // trains customers to ignore the mails that matter.
    expect(notifiesCustomer('processing')).toBe(false);
    expect(notifiesCustomer('pending')).toBe(false);
    expect(notifiesCustomer('refunded')).toBe(false);
  });
});

describe('labels and tones', () => {
  it('has an Arabic and English label for every status', () => {
    for (const s of ORDER_STATUSES) {
      expect(STATUS_LABEL[s].ar.trim()).not.toBe('');
      expect(STATUS_LABEL[s].en.trim()).not.toBe('');
    }
    for (const s of PAYMENT_STATUSES) {
      expect(PAYMENT_LABEL[s].ar.trim()).not.toBe('');
      expect(PAYMENT_LABEL[s].en.trim()).not.toBe('');
    }
  });

  it('has a badge tone for every status, so no badge renders unstyled', () => {
    for (const s of ORDER_STATUSES) expect(STATUS_TONE[s]).toBeTruthy();
    for (const s of PAYMENT_STATUSES) expect(PAYMENT_TONE[s]).toBeTruthy();
  });

  it('labels are distinct, so two statuses cannot look identical in the UI', () => {
    const ar = ORDER_STATUSES.map((s) => STATUS_LABEL[s].ar);
    expect(new Set(ar).size).toBe(ar.length);
  });
});

describe('isOrderStatus', () => {
  it('accepts every real status', () => {
    for (const s of ORDER_STATUSES) expect(isOrderStatus(s)).toBe(true);
  });

  it('rejects anything else, including non-strings', () => {
    // This guards a searchParam that goes into a Postgres enum column, where a
    // bad value is an error rather than an empty result.
    for (const v of ['', 'PENDING', 'deleted', null, undefined, 0, {}, []]) {
      expect(isOrderStatus(v)).toBe(false);
    }
  });
});
