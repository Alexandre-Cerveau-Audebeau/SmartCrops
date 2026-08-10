import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18next from '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import LanguageMenu from './LanguageMenu';

function renderMenu() {
  return render(
    <LanguageProvider>
      <LanguageMenu />
    </LanguageProvider>
  );
}

describe('LanguageMenu (SMA-208 / SMA-56)', () => {
  beforeEach(async () => {
    // LanguageProvider re-applies its stored language on mount (mirrors
    // Home.test), so the key is cleared, not just the i18next singleton.
    localStorage.removeItem('smartcrops-language');
    await i18next.changeLanguage('en');
  });

  it('renders the trigger with the active short code and lists flag + endonym rows', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'Change language' });
    expect(trigger).toHaveTextContent('EN');

    await user.click(trigger);
    const menu = await screen.findByRole('menu');
    const english = within(menu).getByRole('menuitem', { name: 'English' });
    const french = within(menu).getByRole('menuitem', { name: 'Français' });
    // SMA-56 a11y contract: the language NAME is the row's text — the inline
    // SVG flag rides beside it, aria-hidden.
    expect(english.querySelector('svg')).not.toBeNull();
    expect(french.querySelector('svg')).not.toBeNull();
    expect(english.className).toMatch(/Mui-selected/);
    expect(french.className).not.toMatch(/Mui-selected/);
  });

  it('selecting Français writes the shared language and closes the menu', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Change language' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Français' }));

    await waitFor(() => expect(i18next.language).toBe('fr'));
    // The context is the source of truth: it persisted the choice…
    expect(localStorage.getItem('smartcrops-language')).toBe('fr');
    // …and the document language follows (SMA-56 a11y line).
    expect(document.documentElement.lang).toBe('fr');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    // The trigger relabels in French and shows the new short code.
    expect(
      screen.getByRole('button', { name: 'Changer de langue' })
    ).toHaveTextContent('FR');
  });

  it('Escape closes the menu without changing the language', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Change language' }));
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(i18next.language).toBe('en');
    expect(localStorage.getItem('smartcrops-language')).toBeNull();
  });
});
