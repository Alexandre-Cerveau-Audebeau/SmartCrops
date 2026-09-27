import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import YardOutlinedIcon from '@mui/icons-material/YardOutlined';
import DeleteGardenDialog from '../Garden/DeleteGardenDialog';
import RenameGardenDialog from '../Garden/RenameGardenDialog';
import InviteState from './InviteState';
import NoviceGardenCard from './NoviceGardenCard';
import type { NoviceCard } from './noviceCards';
import { DASHBOARD_NOVICE, DASHBOARD_SPACING, DASHBOARD_TYPE } from '../../theme/dashboardTokens';
import type { DashboardGardenData } from '../../types/DashboardData';

interface Props {
  /** One per garden, in the gardens' order — derived once by the page (`noviceCardsOf`). */
  cards: NoviceCard[];
  /** The GARDENS aggregate is loading: skeletons where the cards will be. */
  loading: boolean;
  /** The gardens could not be read: the error and its retry, never a blank page. */
  loadError: boolean;
  /** A re-read is in flight while the error is on screen: the retry says so. */
  refreshing?: boolean;
  onRetry: () => void;
  /** « Créer un jardin » of the empty page — the same dialog the header's button opens. */
  onCreate: () => void;
  /** The location dialog on a garden — from « Ajouter une ville » or from its temperature. */
  onLocate: (gardenId: string) => void;
  /** Re-reads the gardens after a rename. */
  onChanged: () => void;
  /** A deletion the backend confirmed: the page toasts and re-reads. */
  onDeleted: () => void;
  /**
   * The foot's « Passer à la formule Jardinier → » (contract § 4.3, the link
   * decided by Alexandre on 22/09 16:39): the same choice of formula the chip
   * opens — the choice screen of lot F3 —, handed the click so the page gives
   * the focus back to the link when the screen closes.
   */
  onChangeFormula: (event: MouseEvent<HTMLElement>) => void;
}

/** The skeleton cards drawn while the gardens load: the Novice's three at most. */
const SKELETON_CARDS = 3;

/**
 * SMA-448, lot F2 (SMA-436) — THE NOVICE PAGE: one card per garden, and
 * nothing to set. « Une vue novice qui ne ressemble pas aux autres, ni
 * jardinier ni expert, plus compacte, plus simple et faite pour des
 * utilisateurs qui ont entre 0 et 3 jardins » (Alexandre, 22/09 14:53): a
 * page, not a grid of widgets — no mode Modifier, no gallery, no size, no
 * widget at all (R1; contract v3 § 4.3) — so it cannot be turned into the
 * Expert page by setting it. Rendered by `/gardens` in place of the grid
 * (pre-flight § C.5 a): every door to « Mes Jardins » stays the same, and a
 * change of formula replaces the view in place.
 *
 * The cards, as a LIST with headings (one h2 per garden): three columns on a
 * desktop, two on a tablet, one on a phone, the product's 20 px gutter (C25);
 * the feet of a row aligned by the cards' own bodies. The states of the
 * gardens aggregate are the page's: skeletons, the error with its retry, the
 * invitation of an account without a garden (V3-00: « Vous n'avez pas encore
 * de jardin. »), never a « 0 » drawn as a figure (R5).
 *
 * The rename and the deletion are the Gardens widget's own dialogs, shared
 * (`RenameGardenDialog`, `DeleteGardenDialog`): the pencil and the bin of
 * every card open them, as on every row of the widget (V21).
 */
export default function NoviceGardens({
  cards,
  loading,
  loadError,
  refreshing = false,
  onRetry,
  onCreate,
  onLocate,
  onChanged,
  onDeleted,
  onChangeFormula,
}: Props) {
  const { t } = useTranslation();

  const [editingGarden, setEditingGarden] = useState<DashboardGardenData | null>(null);
  // The deletion target OUTLIVES the dialog open flag (the Gardens widget's
  // idiom): every close path only flips `deleteOpen`, so the fading dialog
  // keeps its name, count and (disarmed) button instead of collapsing
  // mid-transition.
  const [deleteTarget, setDeleteTarget] = useState<DashboardGardenData | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const openDeleteDialog = (garden: DashboardGardenData) => {
    setDeleteTarget(garden);
    setDeleteOpen(true);
  };

  /** Three columns from 1 200 px, two from 600, one under — the grid's own breakpoints (V6), its gutter. */
  const gridSx = {
    display: 'grid',
    gridTemplateColumns: {
      xs: '1fr',
      sm: 'repeat(2, minmax(0, 1fr))',
      lg: `repeat(${DASHBOARD_NOVICE.columns}, minmax(0, 1fr))`,
    },
    gap: `${DASHBOARD_SPACING.gutter}px`,
    listStyle: 'none',
    m: 0,
    p: 0,
  } as const;

  const body = () => {
    if (loading) {
      return (
        <Box sx={gridSx}>
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <Skeleton
              key={index}
              data-novice-skeleton
              variant="rounded"
              height={DASHBOARD_NOVICE.skeletonHeight}
              sx={{ borderRadius: '12px' }}
            />
          ))}
        </Box>
      );
    }
    if (loadError) {
      return (
        <Box data-novice-error sx={{ py: 6, textAlign: 'center' }}>
          <Typography sx={{ mb: 2, color: 'text.secondary' }}>{t('gardens.error')}</Typography>
          <Button variant="contained" onClick={onRetry} disabled={refreshing}>
            {t('dashboard.retry')}
          </Button>
        </Box>
      );
    }
    if (cards.length === 0) {
      // V3-00, the state « 0 jardin »: an invitation with its gesture — and
      // no card, no warning, nothing that counts a zero.
      return (
        <Box data-novice-empty sx={{ display: 'flex' }}>
          <InviteState
            icon={<YardOutlinedIcon />}
            message={t('dashboard.novice.empty.title')}
            body={t('dashboard.novice.empty.body')}
            maxWidth={DASHBOARD_NOVICE.inviteMaxW}
            action={
              <Button variant="contained" onClick={onCreate} sx={{ mt: '10px' }}>
                {t('gardens.createGarden')}
              </Button>
            }
          />
        </Box>
      );
    }
    return (
      <Box component="ul" data-novice-cards aria-label={t('dashboard.novice.list')} sx={gridSx}>
        {cards.map((card) => (
          <Box component="li" key={card.garden.id} sx={{ display: 'flex', minWidth: 0 }}>
            <NoviceGardenCard
              card={card}
              onRename={setEditingGarden}
              onDelete={openDeleteDialog}
              onLocate={onLocate}
            />
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Box data-novice-page>
      {body()}

      {/* The foot message of SMA-436 — centred, 14 px (V11's floor, C25),
          the `dashboard_customize` glyph in green — and its link, the one
          decided (§ 4.3): what the Gardener formula adds is said with what
          exists today (R7), in the product's word « formule » (V31). */}
      <Box
        data-novice-foot-message
        sx={{
          mt: `${DASHBOARD_NOVICE.footMessageGap}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '9px',
          textAlign: 'center',
        }}
      >
        <DashboardCustomizeOutlinedIcon aria-hidden sx={{ fontSize: 17, color: 'primary.main', flexShrink: 0 }} />
        <Typography component="span" sx={{ fontSize: `${DASHBOARD_TYPE.secondary}px`, color: 'text.secondary' }}>
          {t('dashboard.novice.foot.text')}
        </Typography>
        <Button
          variant="text"
          size="small"
          onClick={onChangeFormula}
          sx={{
            p: 0,
            minWidth: 0,
            fontSize: `${DASHBOARD_TYPE.secondary}px`,
            fontWeight: 700,
            textTransform: 'none',
          }}
        >
          {t('dashboard.novice.foot.link')}
        </Button>
      </Box>

      <RenameGardenDialog
        garden={editingGarden}
        onClose={() => setEditingGarden(null)}
        onRenamed={onChanged}
      />

      {/* The type-the-name brake (SMA-18 lot 1). The aggregate counts the
          DISTINCT placed varieties itself. */}
      <DeleteGardenDialog
        open={deleteOpen}
        gardenId={deleteTarget?.id ?? ''}
        gardenName={deleteTarget?.name ?? ''}
        summary={{ kind: 'list', plants: deleteTarget?.varietyCount ?? 0 }}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          onDeleted();
        }}
      />
    </Box>
  );
}
