import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import { BLOCK_ICONS } from './blockIcons';
import { DASHBOARD_TYPE } from '../../theme/dashboardTokens';
import {
  DASHBOARD_LEVELS,
  type DashboardBlock,
  type DashboardBlockKey,
  type DashboardLevel,
} from '../../types/Dashboard';

/** Stable ids: the drawer names itself by its heading, the group by its label. */
const TITLE_ID = 'dashboard-customize-title';
const LEVEL_LABEL_ID = 'dashboard-customize-level-label';

/**
 * What a gallery thumbnail can honestly show of a hidden widget (round 4, A8).
 *
 * `A7Personnaliser.dc.html` fills its `.gal-th` with the widget's own headline —
 * « 42,5 m² » over two occupancy bars for Statistics, « 38 pieds » over one for
 * Harvest — so the card shows what is being put back, not a category name a
 * second time.
 *
 * `value` is a formatted string and `bars` are percentages, both supplied by the
 * page, which is the only place that holds the figures. A widget the aggregate
 * cannot feed yet returns `null` and the thumbnail says « soon » instead — rule
 * 4 of the design contract: a missing figure is an invitation, never a zero.
 */
export interface GalleryPreview {
  value: string;
  bars?: number[];
}

interface Props {
  open: boolean;
  level: DashboardLevel;
  /** Every block - the gallery reads the hidden ones. */
  blocks: DashboardBlock[];
  /** A hidden widget's headline figure, or null when it has none yet. */
  preview?: (key: DashboardBlockKey) => GalleryPreview | null;
  onClose: () => void;
  onLevelChange: (level: DashboardLevel) => void;
  onReset: () => void;
  onShow: (key: DashboardBlockKey) => void;
}

/**
 * SMA-336 - the Customize panel (_spec.md 8): the three level cards, the note
 * that says what a level does and does not decide, the reset, and the gallery
 * of hidden widgets. Nothing else - no plan, no quota, no upsell: the frozen
 * design carries no mention of a price or a limit anywhere, and neither does
 * this panel.
 */
export default function CustomizePanel({
  open,
  level,
  blocks,
  preview,
  onClose,
  onLevelChange,
  onReset,
  onShow,
}: Props) {
  const { t } = useTranslation();
  const hidden = blocks.filter((block) => block.hidden);

  const sectionTitleSx = {
    fontSize: `${DASHBOARD_TYPE.title}px`,
    fontWeight: 800,
    letterSpacing: DASHBOARD_TYPE.titleLetterSpacing,
    textTransform: 'uppercase' as const,
    color: 'text.secondary',
  };

  return (
    // The open temporary Drawer is a role="dialog"; without `aria-labelledby`
    // it has no accessible name at all (round 1, E5).
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          'aria-labelledby': TITLE_ID,
          sx: { width: { xs: '100%', sm: 380 } },
        },
      }}
    >
      <Box
        role="presentation"
        sx={{ p: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography id={TITLE_ID} component="h2" variant="h6" fontWeight={700}>
            {t('dashboard.panel.title')}
          </Typography>
          <IconButton
            onClick={onClose}
            aria-label={t('dashboard.panel.close')}
            size="small"
          >
            <CloseRoundedIcon />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* FormControl + FormLabel rather than a bare Typography (round 1,
              E5): it is what wires the group's accessible name, so a screen
              reader announces WHAT the three options choose. */}
          <FormControl>
            <FormLabel id={LEVEL_LABEL_ID} sx={sectionTitleSx}>
              {t('dashboard.panel.levelSection')}
            </FormLabel>
            <RadioGroup
              aria-labelledby={LEVEL_LABEL_ID}
              value={level}
              onChange={(event) =>
                onLevelChange(event.target.value as DashboardLevel)
              }
              sx={{ gap: '8px', mt: '12px' }}
            >
              {DASHBOARD_LEVELS.map((option) => (
                <FormControlLabel
                  key={option}
                  value={option}
                  control={<Radio size="small" />}
                  sx={{
                    m: 0,
                    p: '12px',
                    alignItems: 'flex-start',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: option === level ? 'primary.main' : 'borderSubtle',
                  }}
                  label={
                    <Box>
                      <Typography
                        sx={{
                          fontSize: `${DASHBOARD_TYPE.body}px`,
                          fontWeight: 700,
                        }}
                      >
                        {t(`dashboard.levels.${option}.name`)}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: `${DASHBOARD_TYPE.secondary}px`,
                          color: 'text.secondary',
                        }}
                      >
                        {t(`dashboard.levels.${option}.tagline`)}
                      </Typography>
                    </Box>
                  }
                />
              ))}
            </RadioGroup>
          </FormControl>
          <Typography
            sx={{
              fontSize: `${DASHBOARD_TYPE.secondary}px`,
              color: 'text.secondary',
            }}
          >
            {t('dashboard.panel.note')}
          </Typography>
          {/* A GLYPH before the label (round 5, A10-12). `A7Personnaliser.dc.html`
              draws this control as `<div class="lnk">` opening on an 18 px
              `<svg class="ic">` whose path is `RestartAltOutlined`, matched
              attribute for attribute against `@mui/icons-material`. It is the
              same rule as A10-11 on the page header and A2 on the widget
              titles: in these artboards a control that acts carries a mark. */}
          <Button
            variant="outlined"
            size="small"
            startIcon={<RestartAltOutlinedIcon />}
            onClick={onReset}
          >
            {t('dashboard.panel.reset', {
              level: t(`dashboard.levels.${level}.name`),
            })}
          </Button>
        </Box>

        <Divider />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Typography sx={sectionTitleSx}>
            {t('dashboard.panel.gallerySection')}
          </Typography>
          <Typography
            sx={{
              fontSize: `${DASHBOARD_TYPE.secondary}px`,
              color: 'text.secondary',
            }}
          >
            {t('dashboard.panel.galleryHint')}
          </Typography>
          {hidden.length === 0 ? (
            <Typography
              sx={{
                fontSize: `${DASHBOARD_TYPE.secondary}px`,
                color: 'text.secondary',
              }}
            >
              {t('dashboard.panel.galleryEmpty')}
            </Typography>
          ) : (
            hidden.map((block) => {
              const Icon = BLOCK_ICONS[block.key];
              const name = t(`dashboard.blocks.${block.key}.title`);
              const shown = preview?.(block.key) ?? null;
              return (
                <Box
                  key={block.key}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    // `.gal { gap: 14px; border-radius: 12px; padding: 12px 14px }`
                    gap: '14px',
                    p: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid',
                    borderColor: 'borderSubtle',
                  }}
                >
                  {/* THE THUMBNAIL (round 4, A8) — `.gal-th`, verbatim:
                      `width: 116px; height: 70px; border-radius: 8px; border:
                      1px solid var(--card-bd); background: var(--surface);
                      padding: 9px 10px; display: flex; flex-direction: column;
                      gap: 5px; overflow: hidden`.

                      The row carried a bare 20 px icon beside the widget's
                      name, so eight hidden widgets read as eight lines of text
                      and the gallery showed nothing of what it was offering. */}
                  <Box
                    aria-hidden
                    sx={{
                      width: 116,
                      height: 70,
                      flexShrink: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                      p: '9px 10px',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: 'borderSubtle',
                      backgroundColor: 'surfaceSubtle',
                      overflow: 'hidden',
                    }}
                  >
                    <Box sx={{ display: 'flex', color: 'primary.main' }}>
                      <Icon sx={{ fontSize: 13 }} />
                    </Box>
                    {/* `.gal-th .v { font-size: 15px; font-weight: 800 }` — the
                        widget's own headline when it has one. Five of the eight
                        widgets have no data at all until PR 3/5 and PR 4/5, and
                        an empty box would be the « page blanche » rule 4
                        forbids: they say « soon » in the same place, which is
                        the word the Gardens table already uses for its WEATHER
                        and HARVEST cells. */}
                    <Typography
                      sx={{
                        fontSize: `${DASHBOARD_TYPE.body}px`,
                        fontWeight: 800,
                        lineHeight: 1.1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        ...(shown ? null : { color: 'text.secondary' }),
                      }}
                    >
                      {shown ? shown.value : t('dashboard.panel.gallerySoon')}
                    </Typography>
                    {/* `.gal-th .b { height: 5px; border-radius: 3px }` over
                        `--track`, filled with `--prim`. */}
                    {(shown?.bars ?? []).map((percent, index) => (
                      <Box
                        key={index}
                        sx={{
                          height: 5,
                          borderRadius: '3px',
                          backgroundColor: 'action.hover',
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          sx={{
                            width: `${Math.max(0, Math.min(100, percent))}%`,
                            height: '100%',
                            borderRadius: '3px',
                            backgroundColor: 'primary.main',
                          }}
                        />
                      </Box>
                    ))}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: `${DASHBOARD_TYPE.body}px`,
                        fontWeight: 700,
                      }}
                    >
                      {name}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: `${DASHBOARD_TYPE.secondary}px`,
                        color: 'text.secondary',
                      }}
                    >
                      {t('dashboard.panel.hidden')}
                    </Typography>
                  </Box>
                  {/* `.plus { margin-left: auto; width: 36px; height: 36px;
                      border-radius: 50%; background: var(--prim); color:
                      var(--on-prim) }` — a filled green disc, not the bare
                      glyph the panel had. */}
                  <IconButton
                    onClick={() => onShow(block.key)}
                    aria-label={t('dashboard.panel.add', { widget: name })}
                    sx={{
                      ml: 'auto',
                      flexShrink: 0,
                      width: 36,
                      height: 36,
                      backgroundColor: 'primary.main',
                      color: 'primary.contrastText',
                      '&:hover': { backgroundColor: 'primary.dark' },
                    }}
                  >
                    <AddRoundedIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Box>
              );
            })
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
