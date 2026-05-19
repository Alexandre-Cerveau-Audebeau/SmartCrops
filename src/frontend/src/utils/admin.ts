/**
 * UI gate for the admin re-enrichment buttons on PlantDetail. The list of
 * privileged emails is built-time `VITE_ADMIN_EMAILS` (CSV, trimmed,
 * case-insensitive). This is NOT real authorization — the backend admin
 * endpoints (`/api/admin/trefle/*`, `/api/admin/perenual/*`) already gate on
 * `[Authorize]`, and anything bundled into a Vite `VITE_*` var is visible to
 * every client. The whitelist's only job is to hide a button that would
 * otherwise confuse non-admin users.
 *
 * TODO: replace with `user.isInRole('Admin')` once Identity Roles ship. The
 * Phase 1 audit confirmed the controllers carry a hand-rolled note pointing
 * to the same follow-up.
 */
export function isAdminUser(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = (import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? '';
  const allowed = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  return allowed.includes(email.toLowerCase());
}
