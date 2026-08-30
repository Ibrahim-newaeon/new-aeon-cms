// lib/commerce/customers.ts
import { db } from '@/lib/db';
import { customers, orders } from '@/lib/db/schema';
import { desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { normalisePhone } from './phone';
import { getStoreCountry } from './regions';

/**
 * The customer list.
 *
 * The table existed and checkout has always written to it, but nothing in the
 * admin ever read it — so "has this person ordered before" was a question the
 * panel could not answer about data it was already collecting.
 *
 * Revenue deliberately excludes cancelled and refunded orders. Counting money
 * that was given back makes a best-customer list rank the people who returned
 * the most, which is the opposite of what it is for.
 */
export const NON_REVENUE_STATUSES = ['cancelled', 'refunded'] as const;

export const CUSTOMERS_PAGE_SIZE = 25;

export interface CustomerRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Search matches name, email, or phone.
 *
 * The phone term is normalised first. Numbers are stored canonically as E.164,
 * so searching the `0791234567` a colleague read off an invoice would otherwise
 * match nothing at all — the one search a shop actually performs.
 */
async function searchCondition(term: string): Promise<SQL | undefined> {
  const trimmed = term.trim();
  if (!trimmed) return undefined;

  const needle = `%${escapeLike(trimmed)}%`;
  const clauses: SQL[] = [
    ilike(customers.name, needle),
    ilike(customers.email, needle),
    ilike(customers.phone, needle),
  ];

  const canonical = normalisePhone(trimmed, await getStoreCountry());
  if (canonical) clauses.push(eq(customers.phone, canonical));

  return or(...clauses);
}

const revenueSum = sql<number>`coalesce(sum(
  case when ${orders.status} in ('cancelled','refunded') then 0 else ${orders.total} end
), 0)::int`;

export async function listCustomers({
  search,
  page = 1,
}: { search?: string; page?: number } = {}): Promise<{
  rows: CustomerRow[];
  total: number;
  page: number;
  pageCount: number;
}> {
  const where = search ? await searchCondition(search) : undefined;
  const offset = (Math.max(1, page) - 1) * CUSTOMERS_PAGE_SIZE;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        orderCount: sql<number>`count(${orders.id})::int`,
        totalSpent: revenueSum,
        lastOrderAt: sql<Date | null>`max(${orders.createdAt})`,
      })
      .from(customers)
      .leftJoin(orders, eq(orders.customerId, customers.id))
      .where(where)
      .groupBy(customers.id, customers.name, customers.phone, customers.email)
      // Most recent buyer first; someone who has never ordered sorts last
      // rather than to the top on a null.
      .orderBy(sql`max(${orders.createdAt}) desc nulls last`)
      .limit(CUSTOMERS_PAGE_SIZE)
      .offset(offset),

    db.select({ n: sql<number>`count(*)::int` }).from(customers).where(where),
  ]);

  const total = totalRow[0]?.n ?? 0;
  return {
    rows,
    total,
    page: Math.max(1, page),
    pageCount: Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE)),
  };
}

/** One customer with their orders, newest first. */
export async function getCustomer(id: string) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) return null;

  const history = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      total: orders.total,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.customerId, id))
    .orderBy(desc(orders.createdAt));

  const spent = history
    .filter((o) => !NON_REVENUE_STATUSES.includes(o.status as (typeof NON_REVENUE_STATUSES)[number]))
    .reduce((sum, o) => sum + o.total, 0);

  return { customer, orders: history, totalSpent: spent };
}
