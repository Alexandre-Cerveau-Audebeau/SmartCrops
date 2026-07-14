import { memo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { getPlantColor } from '../../utils/plantColor';

export interface PlantInGarden {
  plantId: string;
  plantName: string;
  scientificName: string;
}

interface PlantsInGardenSectionProps {
  plants: PlantInGarden[];
  gardenId: string | undefined;
  gardenName: string | undefined;
}

export const PlantsInGardenSection = memo(function PlantsInGardenSection({
  plants,
  gardenId,
  gardenName,
}: PlantsInGardenSectionProps) {
  const { t } = useTranslation();

  return (
    <Box sx={{ mt: 3, mb: 2 }}>
      <Typography variant="h6" sx={{ mb: 1.5 }}>
        {t('planner.plantsInGarden')} ({plants.length})
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        {plants.map((p) => {
          const color = getPlantColor(p.plantId);
          return (
            <Box
              key={p.plantId}
              component={RouterLink}
              to={`/library/${p.plantId}`}
              state={{
                from: 'planner',
                gardenId,
                gardenName,
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1,
                minWidth: 200,
                textDecoration: 'none',
                color: 'text.primary',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.paper',
                transition:
                  'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  borderColor: 'primary.main',
                  transform: 'translateY(-1px)',
                  boxShadow: 1,
                },
              }}
            >
              <Avatar
                sx={{ width: 32, height: 32, fontSize: 14, bgcolor: color }}
              >
                {p.plantName.charAt(0).toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" noWrap>
                  {p.plantName}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontStyle: 'italic', color: 'text.secondary' }}
                  noWrap
                  component="div"
                >
                  {p.scientificName}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
});
