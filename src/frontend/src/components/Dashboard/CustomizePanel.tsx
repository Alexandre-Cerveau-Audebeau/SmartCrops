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

interface Props {
  open: boolean;
  level: DashboardLevel;
  /** Every block - the gallery reads the hidden ones. */
  blocks: DashboardBlock[];
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
          <Button variant="outlined" size="small" onClick={onReset}>
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
              return (
                <Box
                  key={block.key}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    p: '12px',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: 'borderSubtle',
                  }}
                >
                  <Icon fontSize="small" sx={{ color: 'text.secondary' }} />
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
                        fontSize: `${DASHBOARD_TYPE.chip}px`,
                        color: 'text.secondary',
                      }}
                    >
                      {t('dashboard.panel.hidden')}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => onShow(block.key)}
                    aria-label={t('dashboard.panel.add', { widget: name })}
                  >
                    <AddRoundedIcon fontSize="small" />
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
