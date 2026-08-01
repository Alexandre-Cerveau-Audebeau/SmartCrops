import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import i18next from '../i18n/i18n';
import LegalNotice from './LegalNotice';

function renderPage() {
  return render(
    <MemoryRouter>
      <LegalNotice />
    </MemoryRouter>
  );
}

describe('LegalNotice (SMA-35)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('renders the real publisher identity, host and date in English, with the courtesy notice', () => {
    const { container } = renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Legal Notice' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Hosting' })
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('Alexandre Cerveau Audebeau').length
    ).toBeGreaterThan(0);
    expect(screen.getByText('OVH SAS')).toBeInTheDocument();
    expect(
      screen.getByText(/2 rue Kellermann - 59100 Roubaix - France/)
    ).toBeInTheDocument();
    expect(screen.getByText(/August 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/the French version prevails/)).toBeInTheDocument();
    // SMA-157 regression: no unresolved [À REMPLIR/CONFIRMER/ACTIVER] marker.
    expect(container.textContent).not.toContain('[À');
    expect(container.textContent).not.toContain('[OPTION');
  });

  it('renders the real content in French without the courtesy notice', async () => {
    await i18next.changeLanguage('fr');
    const { container } = renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mentions légales' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Hébergement' })
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('Alexandre Cerveau Audebeau').length
    ).toBeGreaterThan(0);
    expect(screen.getByText('OVH SAS')).toBeInTheDocument();
    expect(screen.getByText(/1er août 2026/)).toBeInTheDocument();
    expect(
      screen.queryByText(/the French version prevails/)
    ).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('[À');
    expect(container.textContent).not.toContain('[OPTION');
  });

  it('resolves the publisher as a single published identity (no more A/B options)', () => {
    renderPage();
    expect(
      screen.queryByRole('heading', { name: /Option A/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Option B/ })
    ).not.toBeInTheDocument();
  });
});
