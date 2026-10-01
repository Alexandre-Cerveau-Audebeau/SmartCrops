import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import LocationDialog from '../Dashboard/LocationDialog';
import { gardenLocationTarget, storedPlaceKey } from '../Dashboard/locationTools';
import { useDashboardWeather } from '../../hooks/useDashboardWeather';
import { useLanguage } from '../../hooks/useLanguage';
import { usePlannerTokens } from '../../theme/usePlannerTokens';

interface Props {
  /** The garden the section locates: its id, and the name the dialog's title says. */
  garden: { id: string; name: string };
  /**
   * A write the server accepted (204) — « Utiliser » or « Revenir à la ville
   * du profil ». The section re-reads the aggregate itself; the caller may
   * re-read what else the write changed.
   */
  onLocated?: () => void;
}

/**
 * SMA-454 — the planner's door to a garden's city, in « Réglages »: the place
 * the garden reads today, said with the location dialog's own sentence (as
 * the Weather gear says it), and « Modifier la localisation », which opens
 * THE location dialog of the dashboard on this garden — one dialog, several
 * doors. What the dialog holds comes from the weather aggregate through the
 * dashboard's own derivation (`gardenLocationTarget`): the same place named,
 * « Revenir à la ville du profil » on the same terms, « loading » while a read
 * is in flight and « weather unavailable » when it failed; after a write, the
 * same re-read as after a write. The aggregate is read while the section is
 * mounted — while « Réglages » is open.
 */
export default function GardenLocationSection({ garden, onLocated }: Props) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const tk = usePlannerTokens();
  const { data, loading, refreshing, loadError, refetchAfterMutation } =
    useDashboardWeather(language);
  const [open, setOpen] = useState(false);

  // In flight is the first read AND every replacement, as on the dashboard
  // (round 2, D4; round 4, F2).
  const target = gardenLocationTarget(data, garden, {
    loading: loading || refreshing,
    unavailable: loadError,
  });
  // The dialog's own line, from the ONE function the dialog and the Weather
  // gear read. A garden's target never says « a default is stored » — that
  // sentence is the profile's, as in the dialog.
  const currentLine = t(
    storedPlaceKey({
      loading: target.loading === true,
      unavailable: target.unavailable === true,
      name: target.current ?? null,
      stored: false,
    }),
    { place: target.current ?? '' }
  );

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px 16px' }}>
        <Typography
          data-location-line
          sx={{ flex: '1 1 220px', minWidth: 0, fontSize: 13.5, color: tk.tMeta }}
        >
          {currentLine}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<LocationOnOutlinedIcon />}
          onClick={() => setOpen(true)}
          sx={{
            flexShrink: 0,
            textTransform: 'none',
            color: tk.obtnTx,
            borderColor: tk.obtnBd,
            '&:hover': { borderColor: tk.obtnBd },
          }}
        >
          {t('planner.config.locationChange')}
        </Button>
      </Box>
      {/* Over « Réglages », which stays open with what was typed in it; the
          dialog gives the focus back to the door when it closes. */}
      <LocationDialog
        open={open}
        target={target}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false);
          // As the dashboard does after a write (round 4, F1): the aggregate
          // on screen names the place of BEFORE it.
          refetchAfterMutation();
          onLocated?.();
        }}
      />
    </>
  );
}
