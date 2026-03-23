import { useEffect, useState } from 'react';
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
import { fetchPlants, fetchPlantTypes, searchPlants } from '../services/plantApi';
import type { Plant, PlantTranslation } from '../types/Plant';
import type { PlantType } from '../types/PlantType';

function getTranslation(plant: Plant, language = 'en'): PlantTranslation | null {
  return (
    plant.translations.find((t) => t.language === language) ??
    plant.translations[0] ??
    null
  );
}

export default function PlantLibrary() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([fetchPlants(), fetchPlantTypes()])
      .then(([plantsData, typesData]) => {
        setPlants(plantsData);
        setPlantTypes(typesData);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      })
      .finally(() => {
        setLoading(false);
      });
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
      searchPlants(searchQuery, 'en', controller.signal)
        .then(setPlants)
        .catch((err) => {
          if (err.name !== 'AbortError') console.error(err);
        });
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery]);

  const filteredPlants =
    activeType === null ? plants : plants.filter((p) => p.plantTypeId === activeType);

  return (
    <Container maxWidth="lg" sx={{ pt: 4, pb: 6 }}>
      <Typography variant="h4" fontWeight={700} color="primary" sx={{ mb: 3 }}>
        Plant Library
      </Typography>

      {!loading && !error && (
        <>
          <TextField
            placeholder="Search plants by name..."
            fullWidth
            variant="outlined"
            size="small"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
              label="All"
              color={activeType === null ? 'primary' : 'default'}
              variant={activeType === null ? 'filled' : 'outlined'}
              onClick={() => setActiveType(null)}
            />
            {plantTypes.map((pt) => (
              <Chip
                key={pt.id}
                label={pt.name}
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
          <Typography>No plants found yet — check back soon!</Typography>
        </Box>
      )}

      {!loading && plants.length > 0 && filteredPlants.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography>No plants match your search.</Typography>
        </Box>
      )}

      {!loading && filteredPlants.length > 0 && (
        <Grid container spacing={3}>
          {filteredPlants.map((plant) => {
            const t = getTranslation(plant);
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
                      {t?.commonName ?? plant.scientificName}
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
                        label={typeName}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ mb: 1 }}
                      />
                    )}

                    {t?.description && (
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
                        {t.description}
                      </Typography>
                    )}

                    {(plant.sunExposure || plant.waterNeeds) && (
                      <Typography variant="caption" color="text.secondary">
                        {plant.sunExposure && `Sun: ${plant.sunExposure}`}
                        {plant.sunExposure && plant.waterNeeds && ' · '}
                        {plant.waterNeeds && `Water: ${plant.waterNeeds}`}
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
