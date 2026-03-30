import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import YardIcon from '@mui/icons-material/Yard';
import TranslateIcon from '@mui/icons-material/Translate';
import GridOnIcon from '@mui/icons-material/GridOn';
import SensorsIcon from '@mui/icons-material/Sensors';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import CodeIcon from '@mui/icons-material/Code';
import StarIcon from '@mui/icons-material/Star';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { Link as RouterLink } from 'react-router-dom';
import HeroCarousel from '../components/HeroCarousel';
import { fetchPlants } from '../services/plantApi';
import { getTranslation } from '../utils/getTranslation';
import { useLanguage } from '../hooks/useLanguage';
import type { Plant } from '../types/Plant';

const features = [
  {
    icon: <LocalFloristIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
    title: 'Plant Library',
    description:
      'Browse hundreds of plants with detailed growing conditions, seasonal info, and multilingual descriptions.',
  },
  {
    icon: <YardIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
    title: 'Virtual Garden',
    description:
      'Design your garden layout, track your plants, and get personalized growing advice.',
    comingSoon: true,
  },
  {
    icon: <TranslateIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
    title: 'Bilingual Support',
    description:
      'Access plant information in English and French, with more languages planned.',
  },
  {
    icon: <GridOnIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.85 }} />,
    title: 'Garden Planner',
    description:
      'Design your garden layout with drag-and-drop. Place plants on a virtual grid and plan your space.',
    comingSoon: true,
  },
  {
    icon: <SensorsIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.85 }} />,
    title: 'Smart Monitoring',
    description:
      'Connect weather data and IoT sensors to get personalized care recommendations for your plants.',
    comingSoon: true,
  },
];

const steps = [
  {
    number: '1',
    title: 'Browse Plants',
    description:
      'Explore our curated library of plants suited to your region and growing conditions.',
  },
  {
    number: '2',
    title: 'Plan Your Garden',
    description:
      'Organize your selections and plan out your garden for each season.',
  },
  {
    number: '3',
    title: 'Grow with Confidence',
    description:
      'Follow tailored guidance and watch your garden thrive all year long.',
  },
];

const testimonials = [
  {
    name: 'Marie L.',
    location: 'Lyon, France',
    initials: 'ML',
    rating: 5,
    quote:
      'SmartCrops helped me plan my first vegetable garden. The plant library is incredibly detailed!',
  },
  {
    name: 'Thomas C.',
    location: 'Brussels, Belgium',
    initials: 'TC',
    rating: 5,
    quote:
      'The bilingual support is a game-changer. I switch between French and English all the time.',
  },
  {
    name: 'Sarah E.',
    location: 'London, UK',
    initials: 'SE',
    rating: 5,
    quote:
      "I can't wait for the virtual garden feature. Already using the library every week!",
  },
  {
    name: 'Pierre D.',
    location: 'Paris, France',
    initials: 'PD',
    rating: 5,
    quote:
      "Finally a plant app that doesn't try to sell me anything. Clean, useful, and free.",
  },
  {
    name: 'Emma W.',
    location: 'Amsterdam, Netherlands',
    initials: 'EW',
    rating: 4,
    quote:
      'Great start! Would love to see more plants and a sowing calendar in the future.',
  },
  {
    name: 'Lucas M.',
    location: 'Geneva, Switzerland',
    initials: 'LM',
    rating: 5,
    quote:
      'The search feature works beautifully. Found exactly the herbs I needed for my balcony.',
  },
  {
    name: 'Isabelle R.',
    location: 'Bordeaux, France',
    initials: 'IR',
    rating: 5,
    quote:
      "I love that it's open source. Feels like a community project, not a corporate product.",
  },
  {
    name: 'James K.',
    location: 'Dublin, Ireland',
    initials: 'JK',
    rating: 4,
    quote:
      'Simple and effective. The growing conditions section saved me from planting in the wrong spot.',
  },
  {
    name: 'Clara B.',
    location: 'Berlin, Germany',
    initials: 'CB',
    rating: 5,
    quote:
      'Beautiful design and so easy to use. My kids love browsing the plant cards!',
  },
];

export default function Home() {
  const { language } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [plants, setPlants] = useState<Plant[]>([]);
  const [plantsLoading, setPlantsLoading] = useState(true);
  const [plantsError, setPlantsError] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const itemsPerPage = isMobile ? 1 : 3;
  const totalPages = Math.ceil(testimonials.length / itemsPerPage);
  const snappedIndex = useMemo(
    () => Math.floor(currentIndex / itemsPerPage) * itemsPerPage,
    [currentIndex, itemsPerPage],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchPlants(controller.signal)
      .then((data) => setPlants(data.slice(0, 3)))
      .catch((err) => {
        if (err.name !== 'AbortError') setPlantsError(true);
      })
      .finally(() => setPlantsLoading(false));
    return () => controller.abort();
  }, []);

  const handlePrev = () => {
    setCurrentIndex((prev) =>
      prev - itemsPerPage < 0
        ? (totalPages - 1) * itemsPerPage
        : prev - itemsPerPage,
    );
  };

  const handleNext = () => {
    setCurrentIndex((prev) =>
      prev + itemsPerPage >= testimonials.length ? 0 : prev + itemsPerPage,
    );
  };

  const visibleTestimonials = testimonials.slice(
    snappedIndex,
    snappedIndex + itemsPerPage,
  );
  const currentPage = Math.floor(snappedIndex / itemsPerPage);

  return (
    <Box>
      {/* ==================== SECTION 1 — HERO ==================== */}
      <HeroCarousel />

      {/* ==================== SECTION 2 — STATS BAR ==================== */}
      <Box sx={{ bgcolor: '#1B5E3A', py: 3, color: '#fff' }}>
        <Container maxWidth="lg">
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-around',
              flexWrap: 'wrap',
            }}
          >
            {[
              { icon: <LocalFloristIcon sx={{ fontSize: 24 }} />, value: '5+', label: 'Plants' },
              { icon: <TranslateIcon sx={{ fontSize: 24 }} />, value: '2', label: 'Languages' },
              { icon: <CardGiftcardIcon sx={{ fontSize: 24 }} />, value: '100%', label: 'Free' },
              { icon: <CodeIcon sx={{ fontSize: 24 }} />, value: 'Open Source', label: 'Community' },
            ].map((stat) => (
              <Box
                key={stat.label}
                sx={{
                  flex: { xs: '0 0 50%', sm: '0 0 auto' },
                  textAlign: 'center',
                  py: { xs: 1, sm: 0 },
                }}
              >
                <Box sx={{ mb: 0.5 }}>{stat.icon}</Box>
                <Typography variant="h4" fontWeight={700}>
                  {stat.value}
                </Typography>
                <Typography variant="caption">{stat.label}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* ==================== SECTION 3 — FEATURES ==================== */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h4" textAlign="center" color="primary" gutterBottom>
          Why SmartCrops?
        </Typography>
        <Typography
          variant="body1"
          textAlign="center"
          color="text.secondary"
          sx={{ mb: 6 }}
        >
          Everything you need to plan, plant, and grow — all in one place.
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 3,
            justifyItems: 'center',
          }}
        >
          {features.map((feature) => (
            <Card
              key={feature.title}
              variant="outlined"
              sx={{
                width: '100%',
                maxWidth: 400,
                borderRadius: 3,
                p: 4,
                textAlign: 'center',
                position: 'relative',
                transition: 'box-shadow 0.2s',
                '&:hover': { boxShadow: 4 },
                ...(feature.comingSoon && {
                  borderStyle: 'dashed',
                  opacity: 0.85,
                }),
              }}
            >
              {feature.comingSoon && (
                <Chip
                  label="Coming Soon"
                  color="warning"
                  size="small"
                  sx={{ position: 'absolute', top: 12, right: 12 }}
                />
              )}
              <CardContent>
                {feature.icon}
                <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
                  {feature.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {feature.description}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Container>

      {/* ==================== SECTION 4 — LIBRARY PREVIEW ==================== */}
      <Box sx={{ bgcolor: 'rgba(46, 125, 50, 0.04)', py: 8 }}>
        <Container maxWidth="lg">
          <Typography variant="h4" textAlign="center" gutterBottom>
            Discover our plants
          </Typography>
          <Typography
            variant="body1"
            textAlign="center"
            color="text.secondary"
            sx={{ mb: 6 }}
          >
            A sneak peek from our growing collection.
          </Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {plantsError ? (
              <Typography color="text.secondary" sx={{ width: '100%', textAlign: 'center' }}>
                Unable to load plants. Please try again later.
              </Typography>
            ) : plantsLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Card
                    key={i}
                    variant="outlined"
                    sx={{ flex: '1 1 280px', minWidth: 0, borderRadius: 3 }}
                  >
                    <CardContent>
                      <Skeleton variant="text" width="60%" height={32} />
                      <Skeleton variant="text" width="80%" height={20} />
                      <Skeleton
                        variant="rectangular"
                        width={60}
                        height={24}
                        sx={{ borderRadius: 1, my: 1 }}
                      />
                      <Skeleton variant="text" width="100%" />
                      <Skeleton variant="text" width="90%" />
                    </CardContent>
                  </Card>
                ))
              : plants.map((plant) => {
                  const translation = getTranslation(plant, language);
                  return (
                    <Card
                      key={plant.id}
                      variant="outlined"
                      sx={{
                        flex: '1 1 280px',
                        minWidth: 0,
                        borderRadius: 3,
                        transition: 'box-shadow 0.2s',
                        '&:hover': { boxShadow: 4 },
                      }}
                    >
                      <CardContent>
                        <Typography variant="h6">
                          {translation?.commonName ?? plant.scientificName}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontStyle: 'italic', mb: 1 }}
                        >
                          {plant.scientificName}
                        </Typography>
                        {plant.plantType && (
                          <Chip
                            label={plant.plantType.name}
                            size="small"
                            sx={{ mb: 1 }}
                          />
                        )}
                        {translation?.description && (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {translation.description}
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
            }
          </Box>
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Button
              variant="outlined"
              component={RouterLink}
              to="/library"
            >
              View all plants
            </Button>
          </Box>
        </Container>
      </Box>

      {/* ==================== SECTION 5 — HOW IT WORKS ==================== */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h4" textAlign="center" gutterBottom>
          Get Started in Minutes
        </Typography>
        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', mt: 4 }}>
          {steps.map((step) => (
            <Box
              key={step.number}
              sx={{ flex: '1 1 200px', textAlign: 'center' }}
            >
              <Typography
                variant="h2"
                color="primary"
                sx={{ fontWeight: 700, opacity: 0.3 }}
              >
                {step.number}
              </Typography>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {step.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {step.description}
              </Typography>
            </Box>
          ))}
        </Box>
      </Container>

      {/* ==================== SECTION 6 — TESTIMONIALS ==================== */}
      <Box sx={{ bgcolor: 'background.default', py: 8 }}>
        <Container maxWidth="lg">
          <Typography variant="h4" textAlign="center" gutterBottom>
            What gardeners say
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              mt: 4,
            }}
          >
            <IconButton onClick={handlePrev} aria-label="Previous testimonials">
              <ArrowBackIosIcon />
            </IconButton>
            <Box
              sx={{
                display: 'flex',
                gap: 3,
                flexWrap: 'nowrap',
                flex: 1,
                minWidth: 0,
              }}
            >
              {visibleTestimonials.map((t) => (
                <Box
                  key={t.name}
                  sx={{
                    flex: '1 1 280px',
                    minWidth: 0,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 3,
                    p: 3,
                  }}
                >
                  <Box sx={{ mb: 1 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <StarIcon
                        key={i}
                        sx={{
                          fontSize: 16,
                          color: i < t.rating ? '#EF9F27' : 'action.disabled',
                        }}
                      />
                    ))}
                  </Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontStyle: 'italic', mb: 2 }}
                  >
                    &ldquo;{t.quote}&rdquo;
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        bgcolor: 'primary.light',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {t.initials}
                    </Box>
                    <Box>
                      <Typography variant="body2" fontWeight={500}>
                        {t.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t.location}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
            <IconButton onClick={handleNext} aria-label="Next testimonials">
              <ArrowForwardIosIcon />
            </IconButton>
          </Box>
          {/* Pagination dots */}
          <Box
            role="tablist"
            aria-label="Testimonial pages"
            sx={{
              display: 'flex',
              justifyContent: 'center',
              gap: 1,
              mt: 3,
            }}
          >
            {Array.from({ length: totalPages }).map((_, i) => (
              <Box
                key={i}
                role="tab"
                aria-selected={i === currentPage}
                aria-label={`Page ${i + 1} of ${totalPages}`}
                tabIndex={i === currentPage ? 0 : -1}
                onClick={() => setCurrentIndex(i * itemsPerPage)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setCurrentIndex(i * itemsPerPage);
                  }
                }}
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: i === currentPage ? 'primary.main' : 'action.disabled',
                  transition: 'background-color 0.2s',
                  cursor: 'pointer',
                }}
              />
            ))}
          </Box>
        </Container>
      </Box>

      {/* ==================== SECTION 7 — BUILT WITH ==================== */}
      <Box sx={{ bgcolor: '#F5F5F5', py: 8 }}>
        <Container maxWidth="lg">
          <Typography variant="h4" textAlign="center" gutterBottom>
            Built With Modern Tools
          </Typography>
          <Typography
            variant="body1"
            textAlign="center"
            color="text.secondary"
            sx={{ mb: 6 }}
          >
            SmartCrops is powered by industry-standard technologies
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            {[
              { name: 'React', letter: 'R', bg: '#61DAFB', role: 'Frontend UI' },
              { name: 'TypeScript', letter: 'TS', bg: '#3178C6', role: 'Type Safety' },
              { name: '.NET 8', letter: '.N', bg: '#512BD4', role: 'Backend API' },
              { name: 'PostgreSQL', letter: 'PG', bg: '#336791', role: 'Database' },
              { name: 'Docker', letter: 'D', bg: '#2496ED', role: 'Containers' },
              { name: 'GitHub Actions', letter: 'GA', bg: '#2088FF', role: 'CI/CD' },
              { name: 'CodeRabbit', letter: 'CR', bg: '#FF6B2B', role: 'AI Code Review' },
            ].map((tech) => (
              <Box
                key={tech.name}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: 'transform 0.2s ease',
                  '&:hover': { transform: 'scale(1.05)' },
                }}
              >
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    bgcolor: tech.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 16,
                    mb: 1,
                  }}
                >
                  {tech.letter}
                </Box>
                <Typography variant="body2" fontWeight={600}>
                  {tech.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {tech.role}
                </Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* ==================== SECTION 8 — CTA FINAL ==================== */}
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <Container maxWidth="sm">
          <Typography variant="h4" gutterBottom>
            Ready to Start Growing?
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Join SmartCrops today and discover the perfect plants for your
            garden.
          </Typography>
          <Button
            variant="contained"
            size="large"
            component={RouterLink}
            to="/register"
          >
            Get Started — It&apos;s Free
          </Button>
        </Container>
      </Box>

      {/* ==================== SECTION 8 — NEWSLETTER ==================== */}
      <Box sx={{ bgcolor: 'rgba(46, 125, 50, 0.04)', py: 6 }}>
        <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
          <Typography variant="h5" gutterBottom>
            Stay in the loop
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Get updates on new plants, features, and seasonal tips.
          </Typography>
          <Box
            component="form"
            onSubmit={(e: React.FormEvent) => e.preventDefault()}
            sx={{
              display: 'flex',
              gap: 1,
              justifyContent: 'center',
            }}
          >
            <TextField
              placeholder="your@email.com"
              label="Email address"
              type="email"
              size="small"
              fullWidth
              sx={{ maxWidth: 320 }}
            />
            <Button variant="contained" disabled>
              Subscribe (Coming soon)
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
            No spam, unsubscribe anytime.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
