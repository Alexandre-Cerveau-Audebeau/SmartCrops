import { useEffect } from 'react';
import { act } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import i18next from '../i18n/i18n';
import DocumentHead from './DocumentHead';
import { setDocumentTitleOverride } from '../utils/documentTitleOverride';

// SMA-354 lot 2 — contract locks for the single route-level head manager:
// composed titles from existing i18n labels, per-route canonical on public
// routes only (upserted/removed at runtime), language reactivity, and the
// plant-name override used by PlantDetail.

const canonicalLink = () =>
  document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

function renderAt(path: string, children?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DocumentHead />
      {children}
    </MemoryRouter>
  );
}

// Mimics PlantDetail's contract: set the loaded display name (scoped to the
// plant's own route) on mount, clear on unmount so the route title is restored.
function PlantNameProbe({ name, pathname }: { name: string; pathname: string }) {
  useEffect(() => {
    setDocumentTitleOverride(name, pathname);
    return () => setDocumentTitleOverride(null);
  }, [name, pathname]);
  return null;
}

// Exposes the router's navigate function so a test can change routes while the
// tree stays mounted (PlantDetail does not unmount between two plant pages).
// Captured in an effect, not during render (react-hooks/globals).
let navigateTo: (to: string) => void;
function NavigationProbe() {
  const navigate = useNavigate();
  useEffect(() => {
    navigateTo = navigate;
  }, [navigate]);
  return null;
}

describe('DocumentHead (SMA-354)', () => {
  afterEach(async () => {
    setDocumentTitleOverride(null);
    canonicalLink()?.remove();
    document.title = '';
    await i18next.changeLanguage('fr');
  });

  it('composes the title and canonical for a mapped public route (/about)', () => {
    renderAt('/about');
    expect(document.title).toBe('À propos de nous · SmartCrops');
    expect(canonicalLink()?.getAttribute('href')).toBe(
      'https://smartcrops.fr/about'
    );
  });

  it('keeps a useful title but NO canonical on an auth-gated route (/gardens)', () => {
    renderAt('/gardens');
    expect(document.title).toBe('Mes Jardins · SmartCrops');
    expect(canonicalLink()).toBeNull();
  });

  it('falls back to "SmartCrops" with no canonical on an unknown route', () => {
    renderAt('/definitely-not-a-route');
    expect(document.title).toBe('SmartCrops');
    expect(canonicalLink()).toBeNull();
  });

  it('re-composes the current title on language switch', async () => {
    renderAt('/about');
    expect(document.title).toBe('À propos de nous · SmartCrops');
    await act(async () => {
      await i18next.changeLanguage('en');
    });
    expect(document.title).toBe('About Us · SmartCrops');
  });

  it('applies the plant-name override and restores the route title on unmount', () => {
    const view = render(
      <MemoryRouter initialEntries={['/library/42']}>
        <DocumentHead />
        <PlantNameProbe name="Basilic" pathname="/library/42" />
      </MemoryRouter>
    );
    expect(document.title).toBe('Basilic · SmartCrops');
    expect(canonicalLink()?.getAttribute('href')).toBe(
      'https://smartcrops.fr/library/42'
    );
    // Unmounting the probe (PlantDetail leaving) must restore the route title.
    view.rerender(
      <MemoryRouter initialEntries={['/library/42']}>
        <DocumentHead />
      </MemoryRouter>
    );
    expect(document.title).toBe('Bibliothèque de plantes · SmartCrops');
  });

  it('scopes the plant-name override to its own route', () => {
    render(
      <MemoryRouter initialEntries={['/library/aaa']}>
        <DocumentHead />
        <NavigationProbe />
      </MemoryRouter>
    );
    act(() => {
      setDocumentTitleOverride('Tomate', '/library/aaa');
    });
    expect(document.title).toBe('Tomate · SmartCrops');
    // Navigating to another plant WITHOUT republishing (PlantDetail's plant
    // state lags the URL): the stale name must not leak onto /library/bbb.
    act(() => {
      navigateTo('/library/bbb');
    });
    expect(document.title).toBe('Bibliothèque de plantes · SmartCrops');
  });
});
