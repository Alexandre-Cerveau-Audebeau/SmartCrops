/**
 * SMA-394 — 🔴 THE SWITCH.
 *
 * Flip this one word to `false` and every registry helper returns its empty
 * value: no card appears in the library, no slug resolves on the detail page,
 * no override fires. Nothing is deleted, nothing else changes.
 *
 * It lives in its own module so the disabled path is genuinely testable — a
 * test can mock this file and re-import the registry.
 */
export const EASTER_EGGS_ENABLED = true;
