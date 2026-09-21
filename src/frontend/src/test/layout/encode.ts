/**
 * SMA-336 mobile lot, fix round 1 (#5) — the results of a run, as the text of
 * the ONE `<pre>` that `--dump-dom` prints: base64 of the UTF-8 bytes of
 * their JSON, so the HTML serialisation touches nothing.
 *
 * Encoded three bytes at a time, never by spreading the bytes into one call:
 * one argument per byte passes the engine's argument limit at about 120 KiB,
 * and a defect-heavy run — every overlap of every atom, over twenty-nine
 * scenes — is past it, which threw inside the page and reported « no
 * measurements » where it should have reported the defects.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64 (RFC 4648, padded) of any byte length, in one pass over the bytes. */
export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    parts.push(ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63]);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    parts.push(ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + '==');
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    parts.push(ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + '=');
  }
  return parts.join('');
}

/** The run's results as the results `<pre>` carries them: base64 of their JSON's UTF-8 bytes. */
export function encodeResults(results: unknown): string {
  return toBase64(new TextEncoder().encode(JSON.stringify(results)));
}
