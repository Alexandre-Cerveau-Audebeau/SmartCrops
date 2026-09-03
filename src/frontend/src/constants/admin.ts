/**
 * SMA-414 — Admin Dashboard v1 constants (D5 pagination).
 */

/** D5 — rows per page once the listing paginates. */
export const ADMIN_USERS_PAGE_SIZE = 25;

/** D5 — above this many accounts the listing paginates; at or below, ONE page. */
export const ADMIN_USERS_PAGINATION_THRESHOLD = 100;

/** D5 — the single-page request size (the API ceiling). */
export const ADMIN_USERS_SINGLE_PAGE_SIZE = 100;
