import { memo, useMemo } from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import { STICKY_OFFSET } from '../../constants/layout';
import { spacingToFootprintCells } from '../../pages/gardenPlanner/placementGeometry';
import { iosSwitchSx, type PlannerTokens } from '../../theme/plannerTokens';
import { FootprintBadge } from './FootprintBadge';
import { usePlannerTokens } from '../../theme/usePlannerTokens';
import type { Plant } from '../../types/Plant';
import { getPlantDisplayName } from '../../utils/getPlantDisplayName';
import {
  INFRA_META,
  INFRASTRUCTURE_TYPES,
  type InfrastructureType,
} from '../../utils/infrastructure';
import { SOIL_ERASER, SOIL_TYPES, type ArmedSoil } from '../../utils/soil';
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
  /**
   * DnD (lot 2): raw pointerdown on a plant row — the page's drag engine
   * arms a threshold-gated sidebar drag; plain clicks keep the toggle.
   */
  onPlantPointerDown?: (plantId: string, e: React.PointerEvent) => void;
  // SMA-15 (5.4): the armed infrastructure type — selecting a row arms it
  // for painting (and enters the Infrastructures mode); re-clicking disarms.
  selectedInfraType?: InfrastructureType | null;
  onInfraSelect?: (type: InfrastructureType | null) => void;
  // SMA-14: the armed soil type OR the eraser (R3) — same arming grammar
  // as infrastructure.
  selectedSoilType?: ArmedSoil | null;
  onSoilSelect?: (type: ArmedSoil | null) => void;
  /** R3: fill every active cell with the armed soil (eraser = clear all). */
  onSoilFillAll?: () => void;
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
  /**
   * SMA-18: where the sidebar lives. 'rail' (default) = the sticky ≥lg card
   * with its own border/radius/shadow. 'sheet' = inside the bottom Drawer:
   * the card chrome is STRIPPED (the sheet Paper owns radius and elevation)
   * and the root fills the Paper's bounded height, which is what activates
   * the fixed-chrome/scrollable-list splits the rail only gets from its lg
   * maxHeight. Content and behavior are identical between the two.
   */
  variant?: 'rail' | 'sheet';
  /**
   * SMA-18 lot 2 (SMA-345 item 3): the active tab is PAGE state, not
   * component state — the sheet Drawer unmounts this component when it
   * closes, and the nominal mobile gesture (arm, place, reopen, arm again)
   * must land back on the tab the user was working in. Lifting costs zero
   * DOM where keepMounted would hold the whole catalogue list behind a
   * closed sheet; it also carries the tab across rail↔sheet transitions.
   */
  activeTab: PlantSidebarTab;
  onActiveTabChange: (tab: PlantSidebarTab) => void;
}

export type PlantSidebarTab = 'plants' | 'soils' | 'infrastructure';

/**
 * SMA-18 armed identity chip (owner ruling 22 Jul; extracted R3 per the CR
 * shape): the bare deselect text button became this chip — familiar row
 * anatomy (avatar, name, badge) but a deliberately DISTINCT treatment
 * (tinted cntChipBg + 2px solid prim vs the rows' borderLeft marker) so it
 * can never be confused with a list row. SMA-288 grammar preserved: while
 * the catalog is pending the name slot stays empty (never the unknown
 * fallback); the danger X keeps the explicit disarm available in every
 * catalog state.
 */
function ArmedPlantChip({
  armedId,
  armed,
  catalogReady,
  language,
  cellSize,
  onDisarm,
}: {
  /** The armed id — colors the avatar even while the plant is unresolved. */
  armedId: string;
  armed: Plant | undefined;
  catalogReady: boolean;
  language: string;
  cellSize: string;
  onDisarm: () => void;
}) {
  const { t } = useTranslation();
  const tk = usePlannerTokens();
  const armedName = armed
    ? getPlantDisplayName(armed, language)
    : catalogReady
      ? t('planner.unknownPlant')
      : '';
  return (
    <Box
      data-testid="armed-plant-chip"
      sx={{
        mt: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        p: '6px 8px',
        borderRadius: '9px',
        bgcolor: tk.cntChipBg,
        border: `2px solid ${tk.prim}`,
      }}
    >
      <Avatar
        sx={{
          width: 28,
          height: 28,
          fontSize: 12.5,
          fontWeight: 800,
          bgcolor: getPlantColor(armedId),
        }}
      >
        {armedName.charAt(0).toUpperCase()}
      </Avatar>
      <Typography
        component="span"
        noWrap
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: 13.5,
          fontWeight: 700,
          color: tk.tTitle,
        }}
      >
        {armedName}
      </Typography>
      {/* CR R3 (5f2ffa16): the badge mirrors the toolbar indicator in the
          ready-but-missing state — the 1×1? fallback keeps chip and
          indicator in lockstep across all four armed states. Pending still
          renders NO badge (the blank-name grammar). */}
      {(armed || catalogReady) && (
        <FootprintBadge
          fp={
            armed
              ? spacingToFootprintCells(
                  armed.xPlantSpacingValue ?? null,
                  armed.xPlantSpacingUnit ?? null,
                  cellSize
                )
              : { cells: 1, known: false }
          }
        />
      )}
      <IconButton
        size="small"
        aria-label={t('planner.place.disarmLabel', {
          plant: armedName,
        })}
        onClick={onDisarm}
        sx={{ p: '2px', color: tk.dangTx }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

/**
 * SMA-423: ONE catalogue row, memoized. The rows used to be built inline in
 * PlantSidebar's `filtered.map`, so arming a plant — a click whose only
 * changing prop is `selectedPlantId` — rebuilt all ~536 rows to change two,
 * measured at ≈ 85-90 % of that click's commit (pre-flight §3). Every prop
 * below is referentially stable across that click (the catalogue's plant
 * object, primitives, the page's `useCallback([])` handlers, the
 * module-constant tokens), so only the row that arms and the row that
 * disarms re-render; every other row bails out in memo. DOM, aria-pressed
 * toggle, drag wiring and touch-action clamp are the inline row's, verbatim;
 * name / colour / footprint are derived here, per row, as before.
 */
const PlantRow = memo(function PlantRow({
  plant,
  selected,
  cellSize,
  language,
  tk,
  onPlantSelect,
  onPlantPointerDown,
}: {
  plant: Plant;
  selected: boolean;
  cellSize: string;
  language: string;
  tk: PlannerTokens;
  onPlantSelect: (plantId: string | null) => void;
  /**
   * The drag source (the page's engine). Absent in the SHEET — a stable
   * `undefined`, which also lifts the touch-action clamp so the list scrolls
   * under a finger (SMA-18), exactly as the inline row did.
   */
  onPlantPointerDown?: (plantId: string, e: React.PointerEvent) => void;
}) {
  // SMA-194: the picker's primary label is the SAME localized
  // common name the Library shows (scientific fallback inside
  // the resolver); the secondary stays the scientific name.
  const name = getPlantDisplayName(plant, language);
  const color = getPlantColor(plant.id);
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
      selected={selected}
      // R2 (CR committable): the armed toggle state reaches
      // AT — same as the infrastructure rows' aria-pressed.
      aria-pressed={selected}
      // Re-clicking the armed plant disarms it (SMA-193) —
      // same toggle grammar as the infrastructure rows.
      onClick={() => onPlantSelect(selected ? null : plant.id)}
      // DnD (lot 2): the drag engine sees the pointerdown
      // first; a plain click still lands on onClick above.
      onPointerDown={onPlantPointerDown ? (e: React.PointerEvent) => onPlantPointerDown(plant.id, e) : undefined}
      // R4 (mockup metrics): row padding 10×14.
      sx={{
        px: '14px',
        py: '10px',
        // Extension (lot 2 R1): a touch drag must feed the
        // pointer engine, not scroll the list. SMA-18: the
        // clamp follows the drag wiring (GardenGrid's own
        // pattern) — the sheet passes no onPlantPointerDown,
        // and its list MUST scroll under a finger.
        ...(onPlantPointerDown && { touchAction: 'none' }),
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
            {/* Shared badge (SMA-18): same component as the
                armed chip — R2/R3 aria semantics inside. */}
            <FootprintBadge fp={fp} />
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
});

function PlantSidebar({ plants, searchQuery, onSearchChange, selectedPlantId, onPlantSelect, cellSize = '50cm', onPlantPointerDown, selectedInfraType = null, onInfraSelect, selectedSoilType = null, onSoilSelect, onSoilFillAll, language, shapeEditMode, onShapeEditToggle, catalogFailed, onCatalogRetry, catalogReady, variant = 'rail', activeTab, onActiveTabChange }: Props) {
  const { t } = useTranslation();
  const tk = usePlannerTokens();

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
    // SMA-18: in the SHEET the card chrome goes away (the Drawer Paper owns
    // radius/elevation) and flex:1/minHeight:0 hands the Paper's bounded
    // height to the internal splits.
    <Box
      sx={
        variant === 'sheet'
          ? {
              width: '100%',
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }
          : { width: { xs: '100%', lg: 320 }, maxHeight: { lg: `calc(100vh - ${STICKY_OFFSET}px)` }, display: 'flex', flexDirection: 'column', border: `1px solid ${tk.cardBd}`, borderRadius: '12px', boxShadow: tk.shadow, bgcolor: tk.card, flexShrink: 0, overflow: 'hidden', position: { xs: 'static', lg: 'sticky' }, top: { lg: STICKY_OFFSET }, alignSelf: { lg: 'flex-start' } }
      }
    >
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
        onChange={(_, v: PlantSidebarTab) => onActiveTabChange(v)}
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
        {/* Enabled with SMA-14 — the disabled promise is over. */}
        <Tab label={t('planner.tabs.soils')} value="soils" />
        <Tab label={t('planner.tabs.infrastructure')} value="infrastructure" />
      </Tabs>
      {activeTab === 'soils' && (
        <>
          {/* The INFRAS. panel anatomy mirrored (SMA-14): hint line, then the
              eight §15 rows. R4 (GitHub): hint and fill button are FIXED
              chrome — the plants tab's own split (search box fixed, list
              scrolls) — so the one action that operates on the WHOLE garden
              never scrolls out of reach; only the type list scrolls. */}
          <Typography
            sx={{
              p: '12px 16px',
              fontSize: 12,
              lineHeight: 1.5,
              color: tk.tMeta,
              borderBottom: `1px solid ${tk.divider}`,
            }}
          >
            {t('planner.soil.hint')}
          </Typography>
          <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <List dense disablePadding>
            {SOIL_TYPES.map((type) => {
              const style = tk.soil[type];
              const selected = type === selectedSoilType;
              return (
                <ListItemButton
                  key={type}
                  selected={selected}
                  aria-pressed={selected}
                  onClick={() => onSoilSelect?.(selected ? null : type)}
                  sx={{
                    px: '14px',
                    py: '10px',
                    borderLeft: selected
                      ? `3px solid ${tk.prim}`
                      : '3px solid transparent',
                  }}
                >
                  {/* §15 pairing as a chip: the avatar previews the type's
                      OWN trame on the mode's cell base, ringed by the
                      pastille hue — a trame IS the identity, so no icon.
                      No badge either: infra's slot flags the shadow-engine
                      consequence and soil has no model consequence to flag
                      (deliberately omitted rather than filled). */}
                  <ListItemAvatar sx={{ minWidth: 42 }}>
                    <Avatar
                      sx={{
                        width: 34,
                        height: 34,
                        bgcolor: tk.cellOn,
                        border: `2px solid ${style.pastille}`,
                        backgroundImage: style.image,
                        backgroundSize: style.imageSize,
                        ...(style.imagePosition && {
                          backgroundPosition: style.imagePosition,
                        }),
                      }}
                    >
                      {/* Empty child suppresses the Avatar fallback icon —
                          the trame is the preview. */}
                      <span />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    disableTypography
                    primary={
                      <Typography
                        component="span"
                        sx={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: tk.tTitle,
                        }}
                      >
                        {t(`planner.soil.types.${type}`)}
                      </Typography>
                    }
                  />
                </ListItemButton>
              );
            })}
            {/* R3 eraser row — BOTTOM of the list, deliberately: the eight
                types keep the §15 catalog order and primacy (painting is
                the common case) and the eraser sits next to the fill
                action below, forming the panel's utility zone. Armable
                exactly like a type; the avatar reads as ABSENCE, not a
                ninth soil: the inactive-cell fill (cellOff) with the
                anomaly-marker dashed muted ring and the ink_eraser glyph —
                existing tokens only, no trame preview. */}
            <ListItemButton
              key="eraser"
              selected={selectedSoilType === SOIL_ERASER}
              aria-pressed={selectedSoilType === SOIL_ERASER}
              onClick={() =>
                onSoilSelect?.(
                  selectedSoilType === SOIL_ERASER ? null : SOIL_ERASER
                )
              }
              sx={{
                px: '14px',
                py: '10px',
                borderLeft:
                  selectedSoilType === SOIL_ERASER
                    ? `3px solid ${tk.prim}`
                    : '3px solid transparent',
              }}
            >
              <ListItemAvatar sx={{ minWidth: 42 }}>
                <Avatar
                  sx={{
                    width: 34,
                    height: 34,
                    bgcolor: tk.cellOff,
                    border: `1.5px dashed ${tk.muted}`,
                  }}
                >
                  <Sym name="ink_eraser" size={18} color={tk.muted} />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                disableTypography
                primary={
                  <Typography
                    component="span"
                    sx={{ fontSize: 13.5, fontWeight: 700, color: tk.tTitle }}
                  >
                    {t('planner.soil.eraser')}
                  </Typography>
                }
              />
            </ListItemButton>
          </List>
          </Box>
          {/* R3 fill-the-garden action (R4: OUTSIDE the scroll — fixed
              chrome, always reachable) — enabled only when something is
              armed; the label says what it DOES for the armed value (fill
              vs clear). NO confirmation dialog, deliberately: the action
              is fully undoable in ONE step and the planner has no
              confirmation anywhere yet — introducing the first one here
              would pre-empt SMA-18, which owns that concern. */}
          <Box sx={{ p: '12px 16px', borderTop: `1px solid ${tk.divider}` }}>
            <Button
              size="small"
              variant="outlined"
              fullWidth
              disabled={selectedSoilType === null}
              onClick={() => onSoilFillAll?.()}
            >
              {t(
                selectedSoilType === SOIL_ERASER
                  ? 'planner.soil.clearAll'
                  : 'planner.soil.fillAll'
              )}
            </Button>
          </Box>
        </>
      )}
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
              <ArmedPlantChip
                armedId={selectedPlantId}
                armed={plants.find((p) => p.id === selectedPlantId)}
                catalogReady={catalogReady}
                language={language}
                cellSize={cellSize}
                onDisarm={() => onPlantSelect(null)}
              />
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
                {filtered.map((plant) => (
                  // SMA-423: one memoized row per plant (PlantRow above) —
                  // only the rows whose `selected` flips re-render on arming.
                  <PlantRow
                    key={plant.id}
                    plant={plant}
                    selected={plant.id === selectedPlantId}
                    cellSize={cellSize}
                    language={language}
                    tk={tk}
                    onPlantSelect={onPlantSelect}
                    onPlantPointerDown={onPlantPointerDown}
                  />
                ))}
              </List>
            )}
          </Box>
          {/* SMA-18: the États foot CTA — the tap-to-place hint, SHEET only
              and PLANTS tab only. Coexistence with the SOLS foot (the SMA-14
              R4 fill button) is BY TAB: each tab owns its own fixed foot
              slot, so the two never render together and neither is dropped.
              INFRAS keeps no foot (nothing to say there). */}
          {variant === 'sheet' && (
            <Box
              sx={{
                p: '12px 16px',
                borderTop: `1px solid ${tk.divider}`,
                flexShrink: 0,
              }}
            >
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  textAlign: 'center',
                  color: tk.tMeta,
                }}
              >
                {t('planner.sheet.tapHint')}
              </Typography>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

// Memoized export (perf round, lot 2 R2): every prop is stable during a
// drag, so the 500-plant list contributes zero renders to a drag frame.
export default memo(PlantSidebar);
