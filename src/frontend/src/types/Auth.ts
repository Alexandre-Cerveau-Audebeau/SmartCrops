export interface AuthUser {
  email: string;
  userId: string;
  displayName?: string | null;
  /**
   * Admin role flag from `GET /api/auth/me` (SMA-33). UX only — used to hide
   * admin-only UI. The real authorization barrier is the backend
   * `[Authorize(Roles = "Admin")]` gating, not this flag.
   */
  isAdmin: boolean;
}
