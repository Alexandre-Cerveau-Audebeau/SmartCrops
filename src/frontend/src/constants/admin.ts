/**
 * SMA-414 — Admin Dashboard v1 constants.
 */

/**
 * D1 — date (UTC) of migration 30 `20260903154519_AddUserCreatedAt`. Accounts
 * with a null `createdAt` predate it and are shown as "registered before"
 * this date. ISO date only: the display is day-precise on purpose.
 */
export const USER_CREATED_AT_MIGRATION_DATE = '2026-09-03';

/** D5 — rows per page once the listing paginates. */
export const ADMIN_USERS_PAGE_SIZE = 25;

/** D5 — above this many accounts the listing paginates; at or below, ONE page. */
export const ADMIN_USERS_PAGINATION_THRESHOLD = 100;

/** D5 — the single-page request size (the API ceiling). */
export const ADMIN_USERS_SINGLE_PAGE_SIZE = 100;
