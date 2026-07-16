import type { LightSlot } from '../types/Garden';

/**
 * Shared "HH:mm" 24h parsing for the indoor lightSchedule (SMA-17). Returns
 * minutes-since-midnight, or null when the value is not a valid 24h time.
 * Single source for both the duration display and the invalid-slot Save gate.
 */
export function parseHm(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Slot length in hours (0 when malformed or non-positive). */
export function slotHours(slot: LightSlot): number {
  const start = parseHm(slot.start);
  const end = parseHm(slot.end);
  if (start === null || end === null || end <= start) return 0;
  return (end - start) / 60;
}

/** True when a slot is empty, unparseable, or has end <= start. */
export function isInvalidSlot(slot: LightSlot): boolean {
  const start = parseHm(slot.start);
  const end = parseHm(slot.end);
  return start === null || end === null || end <= start;
}

export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}
