import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/i18n';
import { UnitSystemProvider } from '../../contexts/UnitSystemContext';
import UnitSystemSwitch from './UnitSystemSwitch';

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('en');
});

function renderSwitch() {
  return render(
    <UnitSystemProvider>
      <UnitSystemSwitch />
    </UnitSystemProvider>
  );
}

describe('UnitSystemSwitch (SMA-247)', () => {
  it('defaults to metric and switches to imperial on click', async () => {
    const user = userEvent.setup();
    renderSwitch();

    // Each segment exposes its full unit triplet as the accessible name.
    const metric = screen.getByRole('button', { name: /cm · L/ });
    const imperial = screen.getByRole('button', { name: /in · gal/ });

    expect(metric).toHaveAttribute('aria-pressed', 'true');
    expect(imperial).toHaveAttribute('aria-pressed', 'false');

    await user.click(imperial);

    expect(imperial).toHaveAttribute('aria-pressed', 'true');
    expect(metric).toHaveAttribute('aria-pressed', 'false');
    // Wired to the shared context → persisted preference flips.
    expect(localStorage.getItem('smartcrops.unitSystem')).toBe('imperial');
  });
});
