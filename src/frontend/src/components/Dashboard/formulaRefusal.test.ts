import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/i18n';
import { formulaRefusalText } from './formulaRefusal';

// SMA-448, lot F3, step L4 (R3-E1) — a refusal and a failure, each its own
// truth: the reasons the server served; a session that expired, said as
// such; a right the account lacks; a failure a retry may cure.

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('formulaRefusalText', () => {
  it('nothing to say is an empty string — what a live region born empty says', () => {
    expect(formulaRefusalText(null, i18n.t)).toBe('');
  });

  it('a refusal with its reasons, joined as the language lists things', () => {
    expect(
      formulaRefusalText(
        {
          kind: 'refused',
          formula: 'novice',
          reasons: [
            { kind: 'gardens', have: 5, limit: 3 },
            { kind: 'size', gardenId: 'g1', width: 30, height: 30, maxWidth: 20, maxHeight: 20 },
          ],
        },
        i18n.t
      )
    ).toBe('Can’t switch to Novice: 5 gardens for 3 at most and a garden of 30 × 30 cells for 20 × 20 at most');
  });

  it('a session that expired says so — never « try again »', () => {
    const said = formulaRefusalText({ kind: 'unauthorized', formula: 'novice', reasons: [] }, i18n.t);
    expect(said).toBe('Your session has expired. Sign in again to continue.');
    expect(said).not.toMatch(/try again/i);
  });

  it('a right the account lacks says the right, not a retry', () => {
    expect(formulaRefusalText({ kind: 'forbidden', formula: 'expert', reasons: [] }, i18n.t)).toBe(
      'Your account is not allowed to do this.'
    );
  });

  it('a failure the server did not explain proposes to try again', () => {
    expect(formulaRefusalText({ kind: 'failed', formula: 'novice', reasons: [] }, i18n.t)).toBe(
      'Can’t switch to Novice right now; try again'
    );
  });
});
