import { describe, expect, it } from 'vitest';
import { linkFixture, locationFixture, weatherFixture } from '../../test/fixtures/weather';
import { EMPTY_WEATHER_DATA } from '../../types/DashboardWeather';
import { gardenLocationTarget, placeName } from './locationTools';

// SMA-454 — what a GARDEN's location dialog holds, read from the live weather
// aggregate: the ONE derivation behind every door to a garden's location — the
// dashboard's and the planner's « Réglages » —, so two doors can never name
// another place, nor offer another way back.

const LYON = locationFixture({ key: '45.76,4.84', name: 'Lyon' });
const ANNECY = locationFixture({ key: '45.9,6.13', name: 'Annecy' });
const TERRASSE = { id: 'g1', name: 'Terrasse' };
const SETTLED = { loading: false, unavailable: false };

describe('gardenLocationTarget (SMA-454)', () => {
  it('a garden with its own city beside a profile city: its place, and « Back to the profile city »', () => {
    const weather = weatherFixture(
      [ANNECY, LYON],
      [
        linkFixture({ gardenId: 'g1', locationKey: ANNECY.key, source: 'garden' }),
        linkFixture({ gardenId: 'g2', locationKey: LYON.key, source: 'profile' }),
      ]
    );

    expect(gardenLocationTarget(weather, TERRASSE, SETTLED)).toEqual({
      kind: 'garden',
      gardenId: 'g1',
      gardenName: 'Terrasse',
      canRevert: true,
      current: 'Annecy',
      loading: false,
      unavailable: false,
    });
  });

  it('its own city and NO profile city: no way back — the DELETE would leave the garden unlocated', () => {
    const weather = weatherFixture([ANNECY], [linkFixture({ gardenId: 'g1', locationKey: ANNECY.key, source: 'garden' })]);
    expect(weather.profileLocated).toBe(false);

    expect(gardenLocationTarget(weather, TERRASSE, SETTLED)).toMatchObject({ canRevert: false, current: 'Annecy' });
  });

  it('a garden reading the profile city: that place, and nothing to go back to', () => {
    const weather = weatherFixture([LYON], [linkFixture({ gardenId: 'g1', locationKey: LYON.key, source: 'profile' })]);

    expect(gardenLocationTarget(weather, TERRASSE, SETTLED)).toMatchObject({ canRevert: false, current: 'Lyon' });
  });

  it('a garden that is not located: no place, no way back', () => {
    const weather = weatherFixture(
      [LYON],
      [
        linkFixture({ gardenId: 'g1', locationKey: null, source: null }),
        linkFixture({ gardenId: 'g2', locationKey: LYON.key, source: 'garden' }),
      ]
    );

    expect(gardenLocationTarget(weather, TERRASSE, SETTLED)).toMatchObject({ canRevert: false, current: null });
  });

  it('a garden the aggregate does not list — none landed yet — names nothing and offers nothing, and the read’s state passes through', () => {
    expect(gardenLocationTarget(EMPTY_WEATHER_DATA, TERRASSE, { loading: true, unavailable: false })).toEqual({
      kind: 'garden',
      gardenId: 'g1',
      gardenName: 'Terrasse',
      canRevert: false,
      current: null,
      loading: true,
      unavailable: false,
    });
    expect(gardenLocationTarget(EMPTY_WEATHER_DATA, TERRASSE, { loading: false, unavailable: true })).toMatchObject({
      current: null,
      loading: false,
      unavailable: true,
    });
  });
});

describe('placeName (SMA-454)', () => {
  it('names the stored place a key reads — nothing for no key, nor for a key the aggregate does not carry', () => {
    const weather = weatherFixture([LYON], []);

    expect(placeName(weather, LYON.key)).toBe('Lyon');
    expect(placeName(weather, null)).toBeNull();
    expect(placeName(weather, undefined)).toBeNull();
    // A dangling key, modelled on purpose: no place of the aggregate reads it.
    expect(placeName(weather, '0.00,0.00')).toBeNull();
  });
});
