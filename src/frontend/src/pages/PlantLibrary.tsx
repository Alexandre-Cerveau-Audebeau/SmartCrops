import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import SpaIcon from '@mui/icons-material/Spa';
import { useLanguage } from '../hooks/useLanguage';
import { fetchPlants, fetchPlantTypes, searchPlants } from '../services/plantApi';
import type { Plant } from '../types/Plant';
import type { PlantType } from '../types/PlantType';
import { getTranslation } from '../utils/getTranslation';

export default function PlantLibrary() {
  const { t } = useTranslation();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<number | null>(null);
  const { language } = useLanguage();

  useEffect(() => {
    Promise.all([fetchPlants(), fetchPlantTypes()])
      .then(([plantsData, typesData]) => {
        setPlants(plantsData);
        setPlantTypes(typesData);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('library.error'));
      })
      .finally(() => {
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    if (searchQuery.length === 0) {
      fetchPlants(controller.signal)
        .then(setPlants)
        .catch((err) => {
          if (err.name !== 'AbortError') console.error(err);
        });
      return () => controller.abort();
    }
    if (searchQuery.length < 2) return () => controller.abort();

    const timeout = setTimeout(() => {
      searchPlants(searchQuery, language, controller.signal)
        .then(setPlants)
        .catch((err) => {
          if (err.name !== 'AbortError') console.error(err);
        });
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery, language]);

  const filteredPlants =
    activeType === null ? plants : plants.filter((p) => p.plantTypeId === activeType);

  return (
    <Container maxWidth="lg" sx={{ pt: 4, pb: 6 }}>
      <Typography variant="h4" fontWeight={700} color="primary" sx={{ mb: 3 }}>
        {t('library.title')}
      </Typography>

      {!loading && !error && (
        <>
          <TextField
            placeholder={t('library.searchPlaceholder')}
            fullWidth
            variant="outlined"
            size="small"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            inputProps={{ 'aria-label': t('library.searchPlaceholder') }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ mb: 2, maxWidth: 500 }}
          />

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
            <Chip
              label={t('library.allTypes')}
              color={activeType === null ? 'primary' : 'default'}
              variant={activeType === null ? 'filled' : 'outlined'}
              onClick={() => setActiveType(null)}
            />
            {plantTypes.map((pt) => (
              <Chip
                key={pt.id}
                label={t(`plantTypes.${pt.name}`, pt.name)}
                color={activeType === pt.id ? 'primary' : 'default'}
                variant={activeType === pt.id ? 'filled' : 'outlined'}
                onClick={() => setActiveType(pt.id)}
              />
            ))}
          </Box>
        </>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && plants.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <SpaIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
          <Typography>{t('library.noPlants')}</Typography>
        </Box>
      )}

      {!loading && plants.length > 0 && filteredPlants.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography>{t('library.noResults')}</Typography>
        </Box>
      )}

      {!loading && filteredPlants.length > 0 && (
        <Grid container spacing={3}>
          {filteredPlants.map((plant) => {
            const tr = getTranslation(plant, language);
            const typeName = plantTypes.find((pt) => pt.id === plant.plantTypeId)?.name;

            return (
              <Grid key={plant.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Box
                  component={RouterLink}
                  to={`/library/${plant.id}`}
                  sx={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                >
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 3,
                    cursor: 'pointer',
                    transition: 'box-shadow 0.2s ease, transform 0.2s ease',
                    '&:hover': {
                      boxShadow: 3,
                      transform: 'translateY(-2px)',
                    },
                  }}
                >
                  <CardContent>
                    <Typography variant="h6" fontWeight={600}>
                      {tr?.commonName ?? plant.scientificName}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontStyle: 'italic', mb: 1 }}
                    >
                      {plant.scientificName}
                    </Typography>

                    {typeName && (
                      <Chip
                        label={t(`plantTypes.${typeName}`, typeName)}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ mb: 1 }}
                      />
                    )}

                    {tr?.description && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mb: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {tr.description}
                      </Typography>
                    )}

                    {(plant.sunExposure || plant.waterNeeds) && (
                      <Typography variant="caption" color="text.secondary">
                        {plant.sunExposure && `${t('library.sun')}: ${t(`plantValues.${plant.sunExposure}`, plant.sunExposure)}`}
                        {plant.sunExposure && plant.waterNeeds && ' · '}
                        {plant.waterNeeds && `${t('library.water')}: ${t(`plantValues.${plant.waterNeeds}`, plant.waterNeeds)}`}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Container>
  );
}
