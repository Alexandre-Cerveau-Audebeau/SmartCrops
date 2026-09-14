import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import {
  WEATHER_DAY_ICONS,
  WEATHER_NIGHT_ICONS,
  weatherIconKind,
  weatherTone,
} from './weatherIcons';

interface Props {
  /** The provider's `condition:code`; an unknown code draws the cloudy glyph. */
  code: number;
  /** `false` draws the night variant; `true` or `null` (unknown, K3) the day one. */
  isDay: boolean | null;
  /** The glyph size in px — 44 / 36 hero, 28 slot, 24 day row, 14 table cell. */
  px: number;
  /** The provider's condition text: when given, the glyph is an image NAMED by it; otherwise decorative. */
  label?: string | null;
}

/**
 * SMA-336 PR 3b/5 — ONE glyph component for every weather surface: the hero,
 * the six slots, the five days and the MÉTÉO cell. It resolves the group of the
 * code, picks the day or night drawing from the two static tables of
 * `weatherIcons.ts`, and paints it in the token the artboard gives that group
 * (`--sun`, `--cloud`, `--rain`, or the text colour for snow).
 *
 * The provider's own icon URL is never drawn (decision T10); the provider's
 * TEXT, when it travels, names the glyph for assistive technology.
 */
export default function WeatherGlyph({ code, isDay, px, label }: Props) {
  const tk = useDashboardTokens();
  const kind = weatherIconKind(code);
  const Icon = (isDay === false ? WEATHER_NIGHT_ICONS[kind] : undefined) ?? WEATHER_DAY_ICONS[kind];
  const tone = weatherTone(code, isDay);

  return (
    <Icon
      data-weather-glyph={kind}
      role={label ? 'img' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      sx={{
        fontSize: px,
        color: tone === 'text' ? 'text.primary' : tk[tone],
        flexShrink: 0,
      }}
    />
  );
}
