import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import { searchLocations } from '../../services/weatherApi';
import type { LocationPick } from '../../types/DashboardWeather';
import {
  LOCATION_QUERY_MIN_LENGTH,
  LOCATION_SEARCH_DEBOUNCE_MS,
  locationLabel,
  samePick,
} from './locationTools';

interface Props {
  /** The place picked from the list, or none yet. */
  value: LocationPick | null;
  onChange: (pick: LocationPick | null) => void;
  /** The typed text — CONTROLLED, so « Utiliser la ville de mon profil » can pre-fill it (Q2). */
  inputValue: string;
  onInputChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** `small` inside a widget invitation, `medium` in the dialog. */
  size?: 'small' | 'medium';
  /**
   * The text input itself, for a caller that pre-fills the field from OUTSIDE
   * it — the « Utiliser la ville de mon profil » link. MUI's Autocomplete
   * resets a controlled `inputValue` that changes while the input is NOT
   * focused (its `resetInputValue` effect), so the caller focuses the input
   * first and writes the text second.
   */
  inputRef?: React.Ref<HTMLInputElement>;
}

/** What the last search answered, and for which text — read only while the text is still that one. */
interface SearchResults {
  query: string;
  status: 'ok' | 'unavailable';
  picks: LocationPick[];
}

/**
 * SMA-336 PR 3b/5 — the « Ville » field (arbitrage Q4): a MUI `Autocomplete`
 * over `GET /api/geocode/search`, so the ambiguity of « Paris » is settled by
 * the user BEFORE anything is stored — the list shows name, region and
 * country, and only a result the server handed back can be picked.
 *
 * Four rules, all of them tested:
 * - NO request under {@link LOCATION_QUERY_MIN_LENGTH} characters;
 * - one request at most {@link LOCATION_SEARCH_DEBOUNCE_MS} after the last
 *   keystroke, never one per keystroke;
 * - ONE request in flight: the next keystroke aborts the previous request
 *   through its `AbortController`;
 * - a selected place is not searched for again when its own label sits in the
 *   field.
 *
 * The results are DERIVED from the text they answered: `options` is empty the
 * moment the text no longer matches, without any state written from the
 * effect body.
 *
 * Q5, settled by the measure (round 1, V22): the artboard's « Ville ou code
 * postal » promised what the provider does not do — « 69130 » answered a town
 * in the United States. The label is « Ville », the placeholder shows the
 * form that works (« Écully, France »), and the help line says the postal
 * code is not supported and that the country lifts the namesakes. NOTHING is
 * added behind the user's back: the text goes to the server as typed.
 */
export default function LocationField({
  value,
  onChange,
  inputValue,
  onInputChange,
  disabled = false,
  autoFocus = false,
  size = 'medium',
  inputRef,
}: Props) {
  const { t } = useTranslation();
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);

  const query = inputValue.trim();
  const selectedLabel = value ? locationLabel(value) : null;
  const shouldSearch = query.length >= LOCATION_QUERY_MIN_LENGTH && query !== selectedLabel;

  useEffect(() => {
    if (!shouldSearch) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      searchLocations(query, controller.signal)
        .then((picks) => {
          if (!controller.signal.aborted) setResults({ query, status: 'ok', picks });
        })
        .catch(() => {
          // A 503 (« geocoding unavailable »), a network failure or a malformed
          // body all read the same to the user: the search is not answering.
          // An ABORT is not a failure — the next search is already on its way.
          if (!controller.signal.aborted) setResults({ query, status: 'unavailable', picks: [] });
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, LOCATION_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, shouldSearch]);

  const current = shouldSearch && results?.query === query ? results : null;
  const options = current?.status === 'ok' ? current.picks : [];
  const loading = shouldSearch && (searching || current === null);

  const noOptionsText = !shouldSearch
    ? query.length < LOCATION_QUERY_MIN_LENGTH
      ? t('dashboard.location.minChars', { count: LOCATION_QUERY_MIN_LENGTH })
      : t('dashboard.location.selected', { place: selectedLabel })
    : current?.status === 'unavailable'
      ? t('dashboard.location.unavailable')
      : t('dashboard.location.noResults', { query });

  return (
    <Autocomplete<LocationPick, false, false, false>
      options={options}
      value={value}
      onChange={(_event, pick) => onChange(pick)}
      inputValue={inputValue}
      onInputChange={(_event, text, reason) => {
        onInputChange(text);
        // Typing over a picked place UNPICKS it: « Utiliser » must never write
        // a place the field no longer shows.
        if (reason === 'input' && value && text !== locationLabel(value)) onChange(null);
      }}
      getOptionLabel={locationLabel}
      isOptionEqualToValue={samePick}
      // Server-side filtering: the list IS the answer, MUI must not re-filter it.
      filterOptions={(candidates) => candidates}
      loading={loading}
      loadingText={t('dashboard.location.searching')}
      noOptionsText={noOptionsText}
      autoHighlight
      disabled={disabled}
      size={size}
      fullWidth
      renderInput={(params) => (
        <TextField
          {...params}
          label={t('dashboard.location.field')}
          placeholder={t('dashboard.location.placeholder')}
          helperText={t('dashboard.location.help')}
          autoFocus={autoFocus}
          inputRef={inputRef}
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading && <CircularProgress size={16} color="inherit" aria-hidden="true" />}
                  {params.InputProps.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
