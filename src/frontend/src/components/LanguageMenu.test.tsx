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
    // Home.test). Since SMA-393 the no-key default is French, so the
    // English-mechanics tests pin a returning EN visitor via the STORED key.
    localStorage.setItem('smartcrops-language', 'en');
    await i18next.changeLanguage('en');
  });

  it('renders the trigger with the active short code and lists flag + endonym rows', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'EN — change language' });
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

    await user.click(screen.getByRole('button', { name: 'EN — change language' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Français' }));

    await waitFor(() => expect(i18next.language).toBe('fr'));
    // The context is the source of truth: it persisted the choice…
    expect(localStorage.getItem('smartcrops-language')).toBe('fr');
    // …and the document language follows (SMA-56 a11y line).
    expect(document.documentElement.lang).toBe('fr');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    // The trigger relabels in French and shows the new short code.
    expect(
      screen.getByRole('button', { name: 'FR — changer de langue' })
    ).toHaveTextContent('FR');
  });

  it.each([
    ['en', 'EN', 'EN — change language'],
    ['fr', 'FR', 'FR — changer de langue'],
  ])(
    'in %s the name contains the code the trigger shows, for a voice command to reach it (SMA-401, WCAG 2.5.3)',
    async (stored, code, name) => {
      localStorage.setItem('smartcrops-language', stored);
      renderMenu();

      const trigger = await screen.findByRole('button', { name });
      // What the eye reads is the button's one text node: both icons ride
      // aria-hidden, the arrow's ligature name included.
      const shown = [...trigger.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join('');
      expect(shown).toBe(code);
      expect(trigger).toHaveAccessibleName(expect.stringContaining(shown));
    }
  );

  it('carries aria-expanded and aria-controls while open, the profile menu pattern (SMA-401)', async () => {
    const user = userEvent.setup();
    renderMenu();

    // Kept from before the click: an open menu hides the page from role queries.
    const trigger = screen.getByRole('button', { name: 'EN — change language' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'true');
    // Closed, both are absent, not 'false': the profile menu's form.
    expect(trigger).not.toHaveAttribute('aria-expanded');
    expect(trigger).not.toHaveAttribute('aria-controls');

    await user.click(trigger);
    const menu = await screen.findByRole('menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(menu.id).not.toBe('');
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
    expect(trigger.id).not.toBe('');
    expect(menu).toHaveAttribute('aria-labelledby', trigger.id);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(trigger).not.toHaveAttribute('aria-expanded');
    expect(trigger).not.toHaveAttribute('aria-controls');
  });

  it('two menus on one page keep their own ids and their own state (SMA-401)', async () => {
    // The page holds two: the bar or the drawer, and the footer.
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <LanguageMenu />
        <LanguageMenu />
      </LanguageProvider>
    );

    const [first, second] = screen.getAllByRole('button', {
      name: 'EN — change language',
    });
    expect(first.id).not.toBe('');
    expect(first.id).not.toBe(second.id);

    await user.click(first);
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveAttribute('aria-labelledby', first.id);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).not.toHaveAttribute('aria-expanded');
  });

  it('size="small" shrinks the short-code font and the flag; the default stays the original 14/14', () => {
    // Default mount (desktop bar / footer): byte-identical to pre-prop.
    const medium = render(
      <LanguageProvider>
        <LanguageMenu />
      </LanguageProvider>
    );
    const mediumTrigger = screen.getByRole('button', {
      name: 'EN — change language',
    });
    expect(mediumTrigger).toHaveStyle({ fontSize: '14px' });
    expect(
      mediumTrigger.querySelector('svg')!.getAttribute('height')
    ).toBe('14');
    medium.unmount();

    // Small variant (drawer pill row, SMA-352 R2).
    render(
      <LanguageProvider>
        <LanguageMenu size="small" />
      </LanguageProvider>
    );
    const smallTrigger = screen.getByRole('button', {
      name: 'EN — change language',
    });
    expect(smallTrigger).toHaveStyle({ fontSize: '12px' });
    expect(smallTrigger.querySelector('svg')!.getAttribute('height')).toBe(
      '12'
    );
  });

  it('Escape closes the menu without changing the language', async () => {
    // Runs on a FIRST visit (no stored key): the null storage assertion below
    // proves Escape wrote nothing at all, which a pinned key could not show.
    localStorage.removeItem('smartcrops-language');
    const user = userEvent.setup();
    renderMenu();

    await user.click(
      await screen.findByRole('button', { name: 'FR — changer de langue' })
    );
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(i18next.language).toBe('fr');
    expect(localStorage.getItem('smartcrops-language')).toBeNull();
  });

  it('with no stored choice the menu opens on French — the SMA-393 default', async () => {
    localStorage.removeItem('smartcrops-language');
    const user = userEvent.setup();
    renderMenu();

    const trigger = await screen.findByRole('button', {
      name: 'FR — changer de langue',
    });
    expect(trigger).toHaveTextContent('FR');
    expect(document.documentElement.lang).toBe('fr');

    await user.click(trigger);
    const menu = await screen.findByRole('menu');
    expect(
      within(menu).getByRole('menuitem', { name: 'Français' }).className
    ).toMatch(/Mui-selected/);
    expect(
      within(menu).getByRole('menuitem', { name: 'English' }).className
    ).not.toMatch(/Mui-selected/);
  });
});
