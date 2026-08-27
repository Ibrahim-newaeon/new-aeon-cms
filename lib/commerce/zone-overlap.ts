// lib/commerce/zone-overlap.ts
import 'server-only';
import { db } from '@/lib/db';
import { shippingZones } from '@/lib/db/schema';
import { eq, ne, and } from 'drizzle-orm';
import { GOVERNORATES } from './phone';

/**
 * Checkout resolves a zone with `zones.find(z => z.governorates.includes(g))`,
 * which picks whichever active zone happens to come first. If two active zones
 * both claim a governorate, the shipping charge for that governorate depends on
 * row order — so overlap has to be rejected at write time, not discovered when
 * a customer is charged the wrong rate.
 *
 * Inactive zones are ignored: only one zone can be live for a governorate, but
 * keeping a disabled alternative around is legitimate.
 */
export async function findOverlappingGovernorates(
  governorates: string[],
  excludeZoneId?: string
): Promise<string[]> {
  const rows = await db
    .select({ governorates: shippingZones.governorates })
    .from(shippingZones)
    .where(
      excludeZoneId
        ? and(eq(shippingZones.isActive, true), ne(shippingZones.id, excludeZoneId))
        : eq(shippingZones.isActive, true)
    );

  const taken = new Set(rows.flatMap((r) => r.governorates ?? []));
  return governorates.filter((g) => taken.has(g));
}

/** Arabic labels, so the error names the governorate rather than its key. */
export function labelGovernorates(values: string[]): string {
  return values
    .map((v) => GOVERNORATES.find((g) => g.value === v)?.ar ?? v)
    .join('، ');
}
