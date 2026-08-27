import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import PasswordField from './PasswordField';

const REVEAL_LABEL = 'Press and hold to show the password';

/** Renders a bare PasswordField (no rules bubble) holding the given value. */
function renderField(value: string) {
  return render(
    <PasswordField label="Password" value={value} onChange={vi.fn()} />
  );
}

describe('PasswordField — hold to reveal (SMA-350)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  // Nothing to reveal on an empty field, and an adornment that appears on the
  // first keystroke never occupies space before there is a reason to.
  it('renders no reveal button while the value is empty', () => {
    renderField('');

    expect(
      screen.queryByRole('button', { name: REVEAL_LABEL })
    ).not.toBeInTheDocument();
  });

  it('renders the reveal button once the value is non-empty', () => {
    renderField('Str0ng!Pass');

    expect(
      screen.getByRole('button', { name: REVEAL_LABEL })
    ).toBeInTheDocument();
  });

  it('reveals on pointer down and hides again on pointer up', () => {
    renderField('Str0ng!Pass');
    const input = screen.getByLabelText(/^Password/);
    const button = screen.getByRole('button', { name: REVEAL_LABEL });

    expect(input).toHaveAttribute('type', 'password');

    fireEvent.pointerDown(button);
    expect(input).toHaveAttribute('type', 'text');

    fireEvent.pointerUp(button);
    expect(input).toHaveAttribute('type', 'password');
  });

  // A pointer dragged off the button never fires pointerup on it, so without
  // this the field would stay readable with nothing held down.
  it('hides again when the pointer leaves the button', () => {
    renderField('Str0ng!Pass');
    const input = screen.getByLabelText(/^Password/);
    const button = screen.getByRole('button', { name: REVEAL_LABEL });

    fireEvent.pointerDown(button);
    expect(input).toHaveAttribute('type', 'text');

    fireEvent.pointerLeave(button);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('hides again when the button loses focus', () => {
    renderField('Str0ng!Pass');
    const input = screen.getByLabelText(/^Password/);
    const button = screen.getByRole('button', { name: REVEAL_LABEL });

    fireEvent.pointerDown(button);
    expect(input).toHaveAttribute('type', 'text');

    fireEvent.blur(button);
    expect(input).toHaveAttribute('type', 'password');
  });

  // Keyboard parity: the same press-and-hold gesture, without a pointer.
  it('reveals while a key is held and hides on key up', () => {
    renderField('Str0ng!Pass');
    const input = screen.getByLabelText(/^Password/);
    const button = screen.getByRole('button', { name: REVEAL_LABEL });

    fireEvent.keyDown(button, { key: 'Enter' });
    expect(input).toHaveAttribute('type', 'text');

    fireEvent.keyUp(button, { key: 'Enter' });
    expect(input).toHaveAttribute('type', 'password');
  });

  // PR #212 round 2: keyup fired for EVERY key, so releasing an unrelated key
  // — a modifier, a stray letter — while Enter or Space was still held masked
  // the field under the user's finger. Only the reveal keys may end the hold.
  it('stays revealed when an unrelated key is released mid-hold', () => {
    renderField('Str0ng!Pass');
    const input = screen.getByLabelText(/^Password/);
    const button = screen.getByRole('button', { name: REVEAL_LABEL });

    fireEvent.keyDown(button, { key: 'Enter' });
    expect(input).toHaveAttribute('type', 'text');

    fireEvent.keyUp(button, { key: 'a' });
    expect(input).toHaveAttribute('type', 'text');
  });
});

describe('PasswordField — the rules bubble (SMA-350, PR #212 round 1)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  // Characterization: the bubble states FIVE criteria, not six. Identity's
  // RequiredUniqueChars is pinned at 1 and is satisfied by every non-empty
  // password, so the server can never refuse on it — listing a criterion that
  // cannot fail would be noise. Two round-1 review comments proposed adding it;
  // this test is what makes that decision break loudly if it is ever undone.
  it('lists exactly the five criteria the server can actually refuse', async () => {
    render(
      <PasswordField label="Password" value="" onChange={vi.fn()} showRules />
    );

    fireEvent.focus(screen.getByLabelText(/^Password/));

    const bubble = await screen.findByRole('tooltip');
    expect(
      within(bubble).getByText('Your password must contain:')
    ).toBeInTheDocument();
    expect(
      within(bubble)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual([
      'at least 6 characters',
      'at least one digit',
      'at least one lowercase letter',
      'at least one uppercase letter',
      'at least one special character',
    ]);
  });
});
