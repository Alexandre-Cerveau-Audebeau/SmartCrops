import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/i18n';
import { UnitSystemProvider } from '../../contexts/UnitSystemContext';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import UnitSystemToggle from './UnitSystemToggle';

const STORAGE_KEY = 'smartcrops.unitSystem';

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('en');
});

function wrapper({ children }: { children: ReactNode }) {
  return <UnitSystemProvider>{children}</UnitSystemProvider>;
}

describe('useUnitSystem (SMA-178)', () => {
  it('throws when used outside a UnitSystemProvider', () => {
    expect(() => renderHook(() => useUnitSystem())).toThrow(
      /UnitSystemProvider/
    );
  });
});

describe('UnitSystemToggle (SMA-178)', () => {
  it('defaults to Europe (metric) and switches to US (imperial), persisting the choice', async () => {
    const user = userEvent.setup();
    render(<UnitSystemToggle />, { wrapper });

    const europe = screen.getByRole('button', { name: 'Europe' });
    const us = screen.getByRole('button', { name: 'US' });
    expect(europe).toHaveAttribute('aria-pressed', 'true');
    expect(us).toHaveAttribute('aria-pressed', 'false');

    await user.click(us);
    expect(us).toHaveAttribute('aria-pressed', 'true');
    expect(europe).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('imperial');
  });

  it('initializes from the persisted preference', () => {
    localStorage.setItem(STORAGE_KEY, 'imperial');
    render(<UnitSystemToggle />, { wrapper });

    expect(screen.getByRole('button', { name: 'US' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
