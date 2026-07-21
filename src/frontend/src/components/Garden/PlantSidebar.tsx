import { useMemo, useState } from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { STICKY_OFFSET } from '../../constants/layout';
import { spacingToFootprintCells } from '../../pages/gardenPlanner/placementGeometry';
import { iosSwitchSx, type PlannerTokens } from '../../theme/plannerTokens';
import { usePlannerTokens } from '../../theme/usePlannerTokens';
import type { Plant } from '../../types/Plant';
import { getPlantDisplayName } from '../../utils/getPlantDisplayName';
import {
  INFRA_META,
  INFRASTRUCTURE_TYPES,
  type InfrastructureType,
} from '../../utils/infrastructure';
import { getPlantColor } from '../../utils/plantColor';
import { Sym } from '../Sym';

interface Props {
  plants: Plant[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedPlantId: string | null;
  onPlantSelect: (plantId: string | null) => void;
  /** Grid cell size ('25cm' | '50cm' | '1m') — sizes the footprint badges (SMA-193). */
  cellSize?: string;
  // SMA-15 (5.4): the armed infrastructure type — selecting a row arms it
  // for painting (and enters the Infrastructures mode); re-clicking disarms.
  selectedInfraType?: InfrastructureType | null;
  onInfraSelect?: (type: InfrastructureType | null) => void;
  language: string;
  shapeEditMode: boolean;
  onShapeEditToggle: (value: boolean) => void;
  // SMA-288: active-language catalog failure — the plants area swaps to a
  // compact error + Retry instead of an empty (pending-looking) list.
  catalogFailed: boolean;
  onCatalogRetry: () => void;
  // SMA-288 R3: pending ≠ empty — while the active-language catalog resolves,
  // the results area shows a neutral loading state; the localized no-results
  // message is reserved for a READY catalog.
  catalogReady: boolean;
}

type TabValue = 'plants' | 'soils' | 'infrastructure';

/** Footprint badge chip (SMA-193): solid border when the spacing is known,
 * dashed for the mockup's unknown "1×1?" (Achillea) — shared so the two
 * badge variants can never drift apart visually. */
const footprintBadgeSx = (tk: PlannerTokens, known: boolean) => ({
  fontSize: 10.5,
  fontWeight: 700,
  lineHeight: 1.4,
  borderRadius: '999px',
  px: '8px',
  py: '1px',
  flexShrink: 0,
  bgcolor: tk.segBg,
  border: `1px ${known ? 'solid' : 'dashed'} ${tk.divider}`,
  color: tk.muted,
});

export default function PlantSidebar({ plants, searchQuery, onSearchChange, selectedPlantId, onPlantSelect, cellSize = '50cm', selectedInfraType = null, onInfraSelect, language, shapeEditMode, onShapeEditToggle, catalogFailed, onCatalogRetry, catalogReady }: Props) {
  const { t } = useTranslation();
  const tk = usePlannerTokens();
  const [activeTab, setActiveTab] = useState<TabValue>('plants');

  // Search matches the DISPLAYED name (shared Library resolver, SMA-194) OR the
  // scientific name — typing "tomate"/"tomato" must hit, not just "solanum".
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return plants.filter((p) => {
      const name = getPlantDisplayName(p, language);
      return name.toLowerCase().includes(q) || p.scientificName.toLowerCase().includes(q);
    });
  }, [plants, searchQuery, language]);

  return (
    // R3 (item G): the mockup sidebar CARD — card tokens, radius 12, shadow.
    // R4: 320px (OWNER DEVIATION vs the mockup's 288 — readability at full
    // width; tagged in the tokens doc §11) and a sticky rail: pinned below
    // the navbar, capped to the viewport — the INNER list is the scroll
    // surface (root overflowY:auto would double-scroll against it).
    // R5 (CR accept): below lg the rails STACK — full width, no sticky.
    <Box sx={{ width: { xs: '100%', lg: 320 }, maxHeight: { lg: `calc(100vh - ${STICKY_OFFSET}px)` }, display: 'flex', flexDirection: 'column', border: `1px solid ${tk.cardBd}`, borderRadius: '12px', boxShadow: tk.shadow, bgcolor: tk.card, flexShrink: 0, overflow: 'hidden', position: { xs: 'static', lg: 'sticky' }, top: { lg: STICKY_OFFSET }, alignSelf: { lg: 'flex-start' } }}>
      {/* R5 (owner item): the shape-edit toggle adopts the SHARED iPhone-style
          switch (identical to Exposition); mockup row padding 13×16 aligns the
          control with the sidebar content, label 14.5/600 tTitle. */}
      <Box sx={{ p: '13px 16px', borderBottom: '1px solid', borderColor: 'divider' }}>
        <FormControlLabel
          control={
            <Switch
              checked={shapeEditMode}
              onChange={(e) => onShapeEditToggle(e.target.checked)}
              sx={iosSwitchSx(tk)}
            />
          }
          label={
            <Typography sx={{ fontSize: 14.5, fontWeight: 600, color: tk.tTitle }}>
              {t('planner.shapeEditMode')}
            </Typography>
          }
          sx={{ m: 0, gap: 1 }}
        />
      </Box>
      <Tabs
        value={activeTab}
        onChange={(_, v: TabValue) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        // R4 (mockup metrics): tab labels 12.5 w800 — active prim with the
        // 2px prim underline, inactive muted.
        sx={{
          borderBottom: `1px solid ${tk.divider}`,
          minHeight: 40,
          '& .MuiTab-root': { minHeight: 40, fontSize: 12.5, fontWeight: 800, color: tk.muted },
          '& .MuiTab-root.Mui-selected': { color: tk.prim },
          '& .MuiTabs-indicator': { backgroundColor: tk.prim, height: 2 },
        }}
      >
        <Tab label={t('planner.tabs.plants')} value="plants" />
        <Tab label={t('planner.tabs.soils')} value="soils" disabled />
        {/* Enabled with SMA-15 (5.4) — soils keep their own chantier. */}
        <Tab label={t('planner.tabs.infrastructure')} value="infrastructure" />
      </Tabs>
      {activeTab === 'infrastructure' && (
        <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {/* Mockup hint: blocking elements cast a shadow in the Exposure
              layer (SMA-15). */}
          <Typography
            sx={{
              p: '12px 16px',
              fontSize: 12,
              lineHeight: 1.5,
              color: tk.tMeta,
              borderBottom: `1px solid ${tk.divider}`,
            }}
          >
            {t('planner.infra.hint')}
          </Typography>
          <List dense disablePadding>
            {INFRASTRUCTURE_TYPES.map((type) => {
              const meta = INFRA_META[type];
              const style = tk.infra[type];
              const selected = type === selectedInfraType;
              return (
                <ListItemButton
                  key={type}
                  selected={selected}
                  // R5 (CR accept): the armed toggle state reaches AT.
                  aria-pressed={selected}
                  onClick={() => onInfraSelect?.(selected ? null : type)}
                  // The PLANTS row pattern: 10×14 padding, 3px prim marker.
                  sx={{
                    px: '14px',
                    py: '10px',
                    borderLeft: selected
                      ? `3px solid ${tk.prim}`
                      : '3px solid transparent',
                  }}
                >
                  {/* §6 pairing as a chip: the type's bg/border host its
                      icon color — no values beyond the §6 row. */}
                  <ListItemAvatar sx={{ minWidth: 42 }}>
                    <Avatar
                      sx={{
                        width: 34,
                        height: 34,
                        bgcolor: style.bg,
                        border: style.bd,
                      }}
                    >
                      <Sym name={meta.icon} size={18} color={style.icon} />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    disableTypography
                    primary={
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <Typography
                          component="span"
                          sx={{
                            fontSize: 13.5,
                            fontWeight: 700,
                            color: tk.tTitle,
                          }}
                        >
                          {t(`planner.infra.types.${type}`)}
                        </Typography>
                        {/* §6/§13 badges: « Bloque la lumière » (soft danger,
                            --dang-*) vs « Pas d'ombre » (neutral — nearest
                            existing tokens: segBg/divider/muted). */}
                        <Box
                          component="span"
                          sx={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            lineHeight: 1.4,
                            borderRadius: '999px',
                            px: '8px',
                            py: '1px',
                            bgcolor: meta.blocksLight ? tk.dangBg : tk.segBg,
                            border: `1px solid ${
                              meta.blocksLight ? tk.dangBd : tk.divider
                            }`,
                            color: meta.blocksLight ? tk.dangTx : tk.muted,
                          }}
                        >
                          {t(
                            meta.blocksLight
                              ? 'planner.infra.badge.blocks'
                              : 'planner.infra.badge.noShadow'
                          )}
                        </Box>
                      </Box>
                    }
                  />
                </ListItemButton>
              );
            })}
          </List>
        </Box>
      )}
      {activeTab === 'plants' && catalogFailed && (
        <Box role="alert" sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('planner.catalogError')}
          </Typography>
          <Button size="small" variant="outlined" onClick={onCatalogRetry}>
            {t('planner.retry')}
          </Button>
        </Box>
      )}
      {activeTab === 'plants' && !catalogFailed && (
        <>
          <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <TextField
              size="small"
              fullWidth
              placeholder={t('planner.sidebar.search')}
              inputProps={{ 'aria-label': t('planner.sidebar.search') }}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              // R4 (mockup metrics): fs 13.5 on searchBg with inputBd.
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontSize: 13.5,
                  bgcolor: tk.searchBg,
                  '& fieldset': { borderColor: tk.inputBd },
                },
              }}
            />
            {selectedPlantId && (
              <Button
                size="small"
                variant="text"
                onClick={() => onPlantSelect(null)}
                sx={{ mt: 1 }}
              >
                {t('planner.sidebar.deselect')}
              </Button>
            )}
          </Box>
          <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {!catalogReady ? (
              <Typography sx={{ p: 2, textAlign: 'center', fontSize: 12, color: tk.tMeta }}>
                {t('planner.catalogLoading')}
              </Typography>
            ) : filtered.length === 0 ? (
              <Typography sx={{ p: 2, textAlign: 'center', fontSize: 12, color: tk.tMeta }}>
                {t('planner.sidebar.noResults')}
              </Typography>
            ) : (
              <List dense disablePadding>
                {filtered.map((plant) => {
                  // SMA-194: the picker's primary label is the SAME localized
                  // common name the Library shows (scientific fallback inside
                  // the resolver); the secondary stays the scientific name.
                  const name = getPlantDisplayName(plant, language);
                  const color = getPlantColor(plant.id);
                  const selected = plant.id === selectedPlantId;
                  // SMA-193: footprint badge from the list DTO's Perenual
                  // spacing — the SAME rule that sizes the actual placement,
                  // so the badge can never lie. Unknown → the mockup's
                  // dashed "1×1?" (Achillea).
                  const fp = spacingToFootprintCells(
                    plant.xPlantSpacingValue ?? null,
                    plant.xPlantSpacingUnit ?? null,
                    cellSize
                  );
                  return (
                    <ListItemButton
                      key={plant.id}
                      selected={selected}
                      // R2 (CR committable): the armed toggle state reaches
                      // AT — same as the infrastructure rows' aria-pressed.
                      aria-pressed={selected}
                      // Re-clicking the armed plant disarms it (SMA-193) —
                      // same toggle grammar as the infrastructure rows.
                      onClick={() => onPlantSelect(selected ? null : plant.id)}
                      // R4 (mockup metrics): row padding 10×14.
                      sx={{
                        px: '14px',
                        py: '10px',
                        // R5 (CR accept): the selected marker uses the planner
                        // token, not the generic theme primary.
                        borderLeft: selected
                          ? `3px solid ${tk.prim}`
                          : '3px solid transparent',
                      }}
                    >
                      {/* R3/R4 (mockup metrics): avatar 34px round, w800 fs 14.5. */}
                      <ListItemAvatar sx={{ minWidth: 42 }}>
                        <Avatar sx={{ width: 34, height: 34, fontSize: 14.5, fontWeight: 800, bgcolor: color }}>{name.charAt(0).toUpperCase()}</Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        disableTypography
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* R4: name 13.5 w700 tTitle · sci 11.5 italic
                                tSci — the sidebar leg of the day-contrast
                                pass (disableTypography keeps both intact
                                around the badge). */}
                            <Typography component="span" noWrap sx={{ fontSize: 13.5, fontWeight: 700, color: tk.tTitle, minWidth: 0 }}>
                              {name}
                            </Typography>
                            {fp.known ? (
                              <Box
                                component="span"
                                aria-label={t('planner.sidebar.footprint', { cells: fp.cells })}
                                sx={footprintBadgeSx(tk, true)}
                              >
                                {`${fp.cells}×${fp.cells}`}
                              </Box>
                            ) : (
                              // R2 (Extension finding): the dashed "1×1?" is
                              // opaque on its own — the tooltip carries the
                              // États-component explanation and the aria
                              // combines footprint + meaning so AT never
                              // reads "one times one question mark".
                              // describeChild (R3, CR committable): the open
                              // tooltip becomes the badge's DESCRIPTION — the
                              // aria-label NAME survives it.
                              <Tooltip
                                title={t('planner.place.footprintUnknown')}
                                describeChild
                              >
                                <Box
                                  component="span"
                                  aria-label={`1×1 — ${t('planner.place.footprintUnknown')}`}
                                  sx={footprintBadgeSx(tk, false)}
                                >
                                  1×1?
                                </Box>
                              </Tooltip>
                            )}
                          </Box>
                        }
                        secondary={
                          <Typography component="span" noWrap sx={{ display: 'block', fontSize: 11.5, fontStyle: 'italic', color: tk.tSci }}>
                            {plant.scientificName}
                          </Typography>
                        }
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
