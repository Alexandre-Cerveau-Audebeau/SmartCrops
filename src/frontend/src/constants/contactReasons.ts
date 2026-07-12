// Single source of truth for the contact Reason enum (SMA-161). These values
// are the wire contract of the SMA-30 backend (ContactController mirrors this
// exact list in its AllowedValues) — do NOT rename them.
export const REASONS = [
  'plant-data',
  'support',
  'partnership',
  'api',
  'privacy',
  'other',
] as const;

export type ContactReason = (typeof REASONS)[number];
