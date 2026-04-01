/**
 * Hero images from Unsplash (free license):
 * - hero-1.jpg: Geio Tischler (@geiotischler)
 * - hero-3.jpg: Ana Jovanovski
 * - hero-5.jpg: Elly M
 * - hero-6.jpg: Jovana Askrabic
 * - hero-8.jpg: Zoe Richardson
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

const heroImages = [
  { src: '/images/hero/hero-1.jpg', alt: 'Aerial view of garden seedling rows', credit: 'Geio Tischler' },
  { src: '/images/hero/hero-3.jpg', alt: 'Hands planting a seedling in soil', credit: 'Ana Jovanovski' },
  { src: '/images/hero/hero-6.jpg', alt: 'Garden at sunrise with morning light', credit: 'Jovana Askrabic' },
  { src: '/images/hero/hero-5.jpg', alt: 'Potted plants on a sunny windowsill', credit: 'Elly M' },
  { src: '/images/hero/hero-8.jpg', alt: 'Colorful seedling trays from above', credit: 'Zoe Richardson' },
];

export default function HeroCarousel() {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!isPlaying) return;
    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % heroImages.length);
    }, 5000);
  }, [isPlaying]);

  useEffect(() => {
    startTimer();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startTimer]);

  const goToSlide = (index: number) => {
    setActiveIndex(index);
    if (isPlaying) startTimer();
  };

  const togglePlay = () => setIsPlaying((prev) => !prev);

  return (
    <Box
      sx={{
        position: 'relative',
        height: '85vh',
        overflow: 'hidden',
      }}
    >
      {/* Background images */}
      {heroImages.map((img, i) => (
        <Box
          key={img.src}
          component="img"
          src={img.src}
          alt={img.alt}
          loading={i === 0 ? 'eager' : 'lazy'}
          fetchPriority={i === 0 ? 'high' : 'low'}
          decoding="async"
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: i === activeIndex ? 1 : 0,
            transition: 'opacity 1s ease-in-out',
          }}
        />
      ))}

      {/* Dark overlay */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55))',
          zIndex: 1,
        }}
      />

      {/* Text content */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 2,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          color: '#fff',
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h2" fontWeight={800} gutterBottom>
            {t('home.hero.title')}
          </Typography>
          <Typography
            variant="h5"
            sx={{ fontWeight: 400, opacity: 0.9, maxWidth: 600, mx: 'auto', mb: 4 }}
          >
            {t('home.hero.subtitle')}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Button
              variant="outlined"
              size="large"
              component={RouterLink}
              to="/library"
              sx={{
                borderColor: '#fff',
                color: '#fff',
                '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.1)' },
              }}
            >
              {t('home.hero.browseLibrary')}
            </Button>
            <Button
              variant="contained"
              size="large"
              component={RouterLink}
              to="/register"
              sx={{
                bgcolor: '#fff',
                color: 'primary.main',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' },
              }}
            >
              {t('home.hero.createAccount')}
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Navigation dots + play/pause */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        {heroImages.map((img, i) => (
          <Box
            component="button"
            type="button"
            key={img.src}
            onClick={() => goToSlide(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === activeIndex ? 'true' : undefined}
            sx={{
              border: 0,
              p: 0,
              width: i === activeIndex ? 12 : 8,
              height: i === activeIndex ? 12 : 8,
              borderRadius: '50%',
              bgcolor: i === activeIndex ? '#fff' : 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              '&:focus-visible': {
                outline: '2px solid #fff',
                outlineOffset: 2,
              },
            }}
          />
        ))}
        <IconButton
          size="small"
          onClick={togglePlay}
          aria-label={isPlaying ? t('home.hero.pause') : t('home.hero.play')}
          aria-pressed={isPlaying}
          sx={{
            color: '#fff',
            opacity: 0.7,
            '&:hover': { opacity: 1 },
          }}
        >
          {isPlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
        </IconButton>
      </Box>

      {/* Photo credit */}
      <Typography
        sx={{
          position: 'absolute',
          bottom: 8,
          right: 16,
          zIndex: 2,
          color: 'rgba(255,255,255,0.6)',
          fontSize: 12,
        }}
      >
        {t('home.hero.photoCreditFull', { author: heroImages[activeIndex].credit })}
      </Typography>
    </Box>
  );
}
