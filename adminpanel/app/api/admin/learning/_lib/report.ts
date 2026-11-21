import type { NextRequest } from 'next/server';

/**
 * Small helpers shared by the report endpoints of the learning, wishes,
 * advertising and membership modules.
 */

export interface DateRange {
  from: Date | null;
  to: Date | null;
  /** A Mongo condition for a date field, or null when no range was given. */
  condition: Record<string, Date> | null;
}

function parseDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Reads ?from=YYYY-MM-DD&to=YYYY-MM-DD. Both ends are inclusive. */
export function readRange(request: NextRequest): DateRange {
  const params = request.nextUrl.searchParams;
  const from = parseDay(params.get('from'));
  let to = parseDay(params.get('to'));
  if (to) to = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);

  const condition: Record<string, Date> = {};
  if (from) condition.$gte = from;
  if (to) condition.$lte = to;
  return { from, to, condition: Object.keys(condition).length ? condition : null };
}

/** True when a ?from or ?to value was sent but is not a valid date. */
export function rangeIsInvalid(request: NextRequest): boolean {
  const params = request.nextUrl.searchParams;
  for (const key of ['from', 'to']) {
    const value = params.get(key);
    if (value && !parseDay(value)) return true;
  }
  const from = parseDay(params.get('from'));
  const to = parseDay(params.get('to'));
  return Boolean(from && to && from.getTime() > to.getTime());
}

export function money(value: unknown): number {
  const amount = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(amount) ? amount : 0;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A percentage with one decimal, or null when there is nothing to divide by. */
export function percent(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
