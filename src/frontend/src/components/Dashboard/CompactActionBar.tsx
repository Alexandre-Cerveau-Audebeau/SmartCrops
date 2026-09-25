import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { PageActionButtons } from './DashboardActions';

export interface CompactActionBarProps {
  /** The header's repeated buttons have passed the line: the bar takes them over. */
  shown: boolean;
  /** The bottom of the site navbar, measured — where the bar sits. */
  top: number;
  editing: boolean;
  /** The layout is loading or could not be read — the header's buttons' own state. */
  unavailable: boolean;
  onEditingChange: (editing: boolean) => void;
  onCustomize: () => void;
  barRef?: Ref<HTMLDivElement>;
}

/**
 * SMA-437, lot V39, PR B — the compact action bar (V3-05, validated by
 * Alexandre on 25/09: « Magnifique, continue »). When the header's « Modifier
 * » and « Personnaliser » scroll away under the site navbar, the bar brings
 * them back at the top of the screen, right under that navbar, at every width
 * (A-8) — and nothing else: neither « Créer un jardin » nor the level chip
 * (A-7). Not at the Novice formula (A-9, the page does not mount it).
 *
 * Mounted ONCE, right after the header and right before the grid — the order
 * of the keyboard (A-10.6: Shift+Tab from the first widget reaches it) — and
 * `position: fixed` from there: a fixed bar inside `<main>`, whose
 * `overflow-x: clip` the Layout warns about, was measured to paint and take
 * clicks normally in Chrome 153 (pre-flight, constat 15). Hidden, it is
 * `visibility: hidden`, `inert` and `aria-hidden`, slid up behind the site
 * navbar (`z-index` 1099, the navbar's 1100 less one — A-10.2).
 *
 * `.cb` and `.cb-in` of V3-05: a card-coloured bar the whole width of the
 * window, a 1 px rule and a soft shadow under it; inside, the page's 1 200 px
 * column, 53 px high with 8 px above and below. On a phone, « Modifier » and
 * « Personnaliser » in two equal halves; from 600 px, « Mes Jardins » on the
 * left (17 px — the product loads no 800 weight, which draws as 700) and the
 * two buttons on the right.
 */
export default function CompactActionBar({
  shown,
  top,
  editing,
  unavailable,
  onEditingChange,
  onCustomize,
  barRef,
}: CompactActionBarProps) {
  const { t } = useTranslation();

  return (
    <Box
      ref={barRef}
      data-compact-bar
      role="group"
      aria-label={t('dashboard.pageActions')}
      aria-hidden={shown ? undefined : true}
      inert={!shown}
      sx={{
        position: 'fixed',
        top,
        left: 0,
        right: 0,
        zIndex: (theme) => theme.zIndex.appBar - 1,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        transform: shown ? 'none' : 'translateY(-100%)',
        visibility: shown ? 'visible' : 'hidden',
      }}
    >
      <Box
        sx={{
          maxWidth: 1200,
          mx: 'auto',
          height: 53,
          py: '8px',
          px: { xs: '16px', sm: '24px' },
          display: { xs: 'grid', sm: 'flex' },
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))' },
          alignItems: 'center',
          gap: { xs: '8px', sm: '12px' },
        }}
      >
        <Typography
          component="span"
          data-compact-bar-title
          sx={{
            display: { xs: 'none', sm: 'block' },
            mr: 'auto',
            fontSize: 17,
            lineHeight: 1.3,
            fontWeight: 700,
            color: 'primary.main',
            whiteSpace: 'nowrap',
          }}
        >
          {t('gardens.title')}
        </Typography>
        <PageActionButtons
          editing={editing}
          unavailable={unavailable}
          onEditingChange={onEditingChange}
          onCustomize={onCustomize}
        />
      </Box>
    </Box>
  );
}
