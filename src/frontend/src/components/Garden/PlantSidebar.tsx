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
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { STICKY_OFFSET } from '../../constants/layout';
import type { Plant } from '../../types/Plant';
import { getPlantDisplayName } from '../../utils/getPlantDisplayName';
import { getPlantColor } from '../../utils/plantColor';

interface Props {
  plants: Plant[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedPlantId: string | null;
  onPlantSelect: (plantId: string | null) => void;
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

export default function PlantSidebar({ plants, searchQuery, onSearchChange, selectedPlantId, onPlantSelect, language, shapeEditMode, onShapeEditToggle, catalogFailed, onCatalogRetry, catalogReady }: Props) {
  const { t } = useTranslation();
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
    <Box sx={{ width: 320, maxHeight: 480, display: 'flex', flexDirection: 'column', border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', flexShrink: 0, overflow: 'hidden', position: 'sticky', top: STICKY_OFFSET }}>
      <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <FormControlLabel
          control={<Switch checked={shapeEditMode} onChange={(e) => onShapeEditToggle(e.target.checked)} size="small" />}
          label={t('planner.shapeEditMode')}
        />
      </Box>
      <Tabs
        value={activeTab}
        onChange={(_, v: TabValue) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ borderBottom: '1px solid', borderColor: 'divider', minHeight: 40, '& .MuiTab-root': { minHeight: 40, fontSize: 13 } }}
      >
        <Tab label={t('planner.tabs.plants')} value="plants" />
        <Tab label={t('planner.tabs.soils')} value="soils" disabled />
        <Tab label={t('planner.tabs.infrastructure')} value="infrastructure" disabled />
      </Tabs>
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
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                {t('planner.catalogLoading')}
              </Typography>
            ) : filtered.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
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
                  return (
                    <ListItemButton
                      key={plant.id}
                      selected={selected}
                      onClick={() => onPlantSelect(plant.id)}
                      sx={selected ? { borderLeft: '3px solid', borderColor: 'primary.main' } : { borderLeft: '3px solid transparent' }}
                    >
                      <ListItemAvatar sx={{ minWidth: 36 }}>
                        <Avatar sx={{ width: 28, height: 28, fontSize: 14, bgcolor: color }}>{name.charAt(0).toUpperCase()}</Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={name}
                        secondary={plant.scientificName}
                        primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                        secondaryTypographyProps={{ variant: 'caption', fontStyle: 'italic', noWrap: true }}
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
