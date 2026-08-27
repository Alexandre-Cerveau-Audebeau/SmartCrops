import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import PasswordField from './PasswordField';

const REVEAL_LABEL = 'Press and hold to show the password';

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
});
