/**
 * SMA-414 — Admin Dashboard v1 (read-only) contracts, mirrors of the API
 * records (`AdminDashboardStatsResponse`, `AdminUserListItemResponse`,
 * `PagedResponse<T>`). Dates travel as ISO 8601 UTC strings.
 */

export interface AdminDashboardStats {
  totalUsers: number;
  /** Accounts stamped with a `createdAt` in the last 7 days (D1: nulls excluded). */
  newUsersLast7Days: number;
  /** Accounts stamped with a `createdAt` in the last 30 days (D1: nulls excluded). */
  newUsersLast30Days: number;
  gardensCount: number;
  /** ISO instant of the most recent garden, or null when there is none. */
  latestGardenCreatedAt: string | null;
  placementsCount: number;
  /** Distinct `Gardens.UserId`. */
  usersWithAtLeastOneGarden: number;
  /**
   * Round 1 (V1): the earliest recorded `createdAt` across all accounts (ISO),
   * or null when no account carries one yet. Accounts with a null `createdAt`
   * were created before this instant.
   */
  createdAtTrackedSince: string | null;
}

export interface AdminUserListItem {
  id: string;
  email: string | null;
  displayName: string | null;
  /** ISO instant, or null for accounts that predate migration 30 (D1). */
  createdAt: string | null;
  emailConfirmed: boolean;
  /** `PasswordHash` is not null (D2). */
  hasPassword: boolean;
  /** An `AspNetUserLogins` row with the Google provider exists (D2). */
  hasGoogleLogin: boolean;
}

export interface PagedResponse<T> {
  items: T[];
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
}
