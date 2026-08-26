import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  getTitleOverride,
  subscribeToTitleOverride,
} from '../utils/documentTitleOverride';

// SMA-354 lot 2 — single route-level head manager, mounted once in Layout.
// Runtime JS by design (no pre-rendering/SSR): Google executes it, while
// social scrapers keep reading the static lot-1 head shipped in index.html.

const SITE_NAME = 'SmartCrops';
// Mirrors the static <title> of index.html — no existing i18n key carries this
// exact brand meaning (home.hero.title reads differently), so the literal is
// the source, per the SMA-354 design lock.
const BRAND_TITLE = 'SmartCrops — Votre jardin virtuel intelligent';
const CANONICAL_ORIGIN = 'https://smartcrops.fr';

// Exact-path route → existing i18n label key. /auth/callback and
// /confirm-email are deliberately unmapped (their only strings are transient
// status messages, not page labels) and fall back to the bare site name.
const ROUTE_TITLE_KEYS: Record<string, string> = {
  '/about': 'footer.aboutUs',
  '/contact': 'contact.title',
  '/shop': 'shop.title',
  '/library': 'library.title',
  '/legal-notice': 'legal.mentions.title',
  '/privacy': 'legal.privacy.title',
  '/terms': 'legal.terms.title',
  '/reset-password': 'auth.resetPasswordTitle',
  '/login': 'auth.login',
  '/register': 'auth.register',
  '/forgot-password': 'auth.forgotPasswordTitle',
  '/gardens': 'gardens.title',
  '/profile': 'profile.title',
};

const PLANT_DETAIL_RE = /^\/library\/[^/]+$/;
const PLANNER_RE = /^\/gardens\/[^/]+\/planner$/;

// The 8 fixed public routes of sitemap.xml; /library/:id is matched by regex.
// Every other route (guest-only, auth-gated, unknown) gets NO canonical.
const CANONICAL_PATHS = new Set([
  '/',
  '/about',
  '/contact',
  '/shop',
  '/library',
  '/legal-notice',
  '/privacy',
  '/terms',
]);

/** Headless per-route document-title + canonical manager, mounted once in Layout. */
export default function DocumentHead() {
  const { pathname } = useLocation();
  // useTranslation re-renders this component on languageChanged, so the title
  // recomposes in render scope and the effect below only touches the DOM when
  // the resulting strings actually change.
  const { t } = useTranslation();
  const override = useSyncExternalStore(
    subscribeToTitleOverride,
    getTitleOverride
  );

  let title: string;
  if (override && override.pathname === pathname) {
    // Scoped override (PR #211 round 1): applied only on the exact route it
    // was published for, so a stale plant name never leaks onto the next page.
    title = `${override.name} · ${SITE_NAME}`;
  } else if (pathname === '/') {
    title = BRAND_TITLE;
  } else if (PLANT_DETAIL_RE.test(pathname)) {
    title = `${t('library.title')} · ${SITE_NAME}`;
  } else if (PLANNER_RE.test(pathname)) {
    title = `${t('planner.title')} · ${SITE_NAME}`;
  } else {
    const key = ROUTE_TITLE_KEYS[pathname];
    title = key ? `${t(key)} · ${SITE_NAME}` : SITE_NAME;
  }

  const canonicalHref =
    CANONICAL_PATHS.has(pathname) || PLANT_DETAIL_RE.test(pathname)
      ? // pathname only — query strings never reach the canonical.
        CANONICAL_ORIGIN + pathname
      : null;

  useEffect(() => {
    document.title = title;

    const existing = document.head.querySelector('link[rel="canonical"]');
    if (canonicalHref) {
      const link = existing ?? document.createElement('link');
      link.setAttribute('rel', 'canonical');
      link.setAttribute('href', canonicalHref);
      if (!existing) document.head.appendChild(link);
    } else {
      existing?.remove();
    }
  }, [title, canonicalHref]);

  return null;
}
