import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
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
import GrassIcon from '@mui/icons-material/Grass';
import HandymanIcon from '@mui/icons-material/Handyman';
import StarIcon from '@mui/icons-material/Star';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import HeroCarousel from '../components/HeroCarousel';
import { fetchPlants } from '../services/plantApi';
import { getTranslation } from '../utils/getTranslation';
import { useLanguage } from '../hooks/useLanguage';
import type { Plant } from '../types/Plant';

interface FeatureItem {
  icon: ReactNode;
  titleKey: string;
  descKey: string;
  comingSoon?: boolean;
}

interface TechItem {
  name: string;
  logo: string;
  role: string;
}

const features: FeatureItem[] = [
  {
    icon: <LocalFloristIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
    titleKey: 'home.features.plantLibrary',
    descKey: 'home.features.plantLibraryDesc',
  },
  {
    icon: <YardIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
    titleKey: 'home.features.virtualGarden',
    descKey: 'home.features.virtualGardenDesc',
    comingSoon: true,
  },
  {
    icon: <TranslateIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
    titleKey: 'home.features.bilingualSupport',
    descKey: 'home.features.bilingualSupportDesc',
  },
  {
    icon: <GridOnIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.85 }} />,
    titleKey: 'home.features.gardenPlanner',
    descKey: 'home.features.gardenPlannerDesc',
    comingSoon: true,
  },
  {
    icon: <SensorsIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.85 }} />,
    titleKey: 'home.features.smartMonitoring',
    descKey: 'home.features.smartMonitoringDesc',
    comingSoon: true,
  },
];

const steps = [
  { number: '1', titleKey: 'home.howItWorks.step1Title', descKey: 'home.howItWorks.step1Desc' },
  { number: '2', titleKey: 'home.howItWorks.step2Title', descKey: 'home.howItWorks.step2Desc' },
  { number: '3', titleKey: 'home.howItWorks.step3Title', descKey: 'home.howItWorks.step3Desc' },
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

const currentTech: TechItem[] = [
  { name: 'React', logo: '/images/tech/react.svg', role: 'Frontend UI' },
  { name: 'TypeScript', logo: '/images/tech/typescript.svg', role: 'Type Safety' },
  { name: 'Vite', logo: '/images/tech/vite.svg', role: 'Build Tool' },
  { name: '.NET 8', logo: '/images/tech/dotnet.svg', role: 'Backend API' },
  { name: 'PostgreSQL', logo: '/images/tech/postgresql.svg', role: 'Database' },
  { name: 'Docker', logo: '/images/tech/docker.svg', role: 'Containers' },
  { name: 'GitHub Actions', logo: '/images/tech/githubactions.svg', role: 'CI/CD' },
  { name: 'CodeRabbit', logo: '/images/tech/coderabbit.svg', role: 'AI Code Review' },
  { name: 'Claude', logo: '/images/tech/claude.svg', role: 'AI Assistant' },
  { name: 'OVH', logo: '/images/tech/ovh.svg', role: 'Domain & DNS' },
];

const plannedTech: TechItem[] = [
  { name: 'Kubernetes', logo: '/images/tech/kubernetes.svg', role: 'Orchestration' },
  { name: 'AWS', logo: '/images/tech/aws.svg', role: 'Cloud Platform' },
  { name: 'Redis', logo: '/images/tech/redis.svg', role: 'Caching' },
  { name: 'Elasticsearch', logo: '/images/tech/elasticsearch.svg', role: 'Search Engine' },
  { name: 'Terraform', logo: '/images/tech/terraform.svg', role: 'Infrastructure as Code' },
];

export default function Home() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const navigate = useNavigate();
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
              { id: 'plants', icon: <LocalFloristIcon sx={{ fontSize: 24 }} />, value: '30+', label: t('home.stats.plants'), onClick: () => navigate('/library') },
              { id: 'languages', icon: <TranslateIcon sx={{ fontSize: 24 }} />, value: '2', label: t('home.stats.languages') },
              { id: 'tools', icon: <HandymanIcon sx={{ fontSize: 24 }} />, value: '5', label: t('home.stats.tools'), onClick: () => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }) },
              { id: 'gardens', icon: <GrassIcon sx={{ fontSize: 24 }} />, value: '∞', label: t('home.stats.gardens'), onClick: () => navigate('/gardens') },
            ].map((stat) => (
              <Box
                key={stat.id}
                component={stat.onClick ? 'button' : 'div'}
                type={stat.onClick ? 'button' : undefined}
                onClick={stat.onClick}
                aria-label={stat.onClick ? stat.label : undefined}
                sx={{
                  border: 0,
                  background: 'transparent',
                  color: 'inherit',
                  flex: { xs: '0 0 50%', sm: '0 0 auto' },
                  textAlign: 'center',
                  py: { xs: 1, sm: 0 },
                  ...(stat.onClick && { cursor: 'pointer' }),
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
      <Container id="features" maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h4" textAlign="center" color="primary" gutterBottom>
          {t('home.features.title')}
        </Typography>
        <Typography
          variant="body1"
          textAlign="center"
          color="text.secondary"
          sx={{ mb: 6 }}
        >
          {t('home.features.subtitle')}
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
              key={feature.titleKey}
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
                  label={t('home.features.comingSoon')}
                  color="warning"
                  size="small"
                  sx={{ position: 'absolute', top: 12, right: 12 }}
                />
              )}
              <CardContent>
                {feature.icon}
                <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
                  {t(feature.titleKey)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t(feature.descKey)}
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
            {t('home.libraryPreview.title')}
          </Typography>
          <Typography
            variant="body1"
            textAlign="center"
            color="text.secondary"
            sx={{ mb: 6 }}
          >
            {t('home.libraryPreview.subtitle')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {plantsError ? (
              <Typography color="text.secondary" sx={{ width: '100%', textAlign: 'center' }}>
                {t('home.libraryPreview.error')}
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
              {t('home.libraryPreview.viewAll')}
            </Button>
          </Box>
        </Container>
      </Box>

      {/* ==================== SECTION 5 — HOW IT WORKS ==================== */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h4" textAlign="center" gutterBottom>
          {t('home.howItWorks.title')}
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
                {t(step.titleKey)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t(step.descKey)}
              </Typography>
            </Box>
          ))}
        </Box>
      </Container>

      {/* ==================== SECTION 6 — TESTIMONIALS ==================== */}
      <Box sx={{ bgcolor: 'background.default', py: 8 }}>
        <Container maxWidth="lg">
          <Typography variant="h4" textAlign="center" gutterBottom>
            {t('home.testimonials.title')}
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
              {visibleTestimonials.map((testimonial) => (
                <Box
                  key={testimonial.name}
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
                          color: i < testimonial.rating ? '#EF9F27' : 'action.disabled',
                        }}
                      />
                    ))}
                  </Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontStyle: 'italic', mb: 2 }}
                  >
                    &ldquo;{testimonial.quote}&rdquo;
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
                      {testimonial.initials}
                    </Box>
                    <Box>
                      <Typography variant="body2" fontWeight={500}>
                        {testimonial.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {testimonial.location}
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
            {t('home.builtWith.title')}
          </Typography>
          <Typography
            variant="body1"
            textAlign="center"
            color="text.secondary"
            sx={{ mb: 6 }}
          >
            {t('home.builtWith.subtitle')}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            {currentTech.map((tech) => (
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
                  component="img"
                  src={tech.logo}
                  alt={tech.name}
                  loading="lazy"
                  decoding="async"
                  sx={{ width: 40, height: 40, mb: 1 }}
                />
                <Typography variant="body2" fontWeight={600}>
                  {tech.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {tech.role}
                </Typography>
              </Box>
            ))}
          </Box>
          <Divider sx={{ my: 4 }} />
          <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 3 }}>
            {t('home.builtWith.roadmap')}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 3,
            }}
          >
            {plannedTech.map((tech) => (
              <Box
                key={tech.name}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  opacity: 0.7,
                  transition: 'transform 0.2s ease, opacity 0.2s ease',
                  '&:hover': { transform: 'scale(1.05)', opacity: 1 },
                }}
              >
                <Box
                  component="img"
                  src={tech.logo}
                  alt={tech.name}
                  loading="lazy"
                  decoding="async"
                  sx={{ width: 32, height: 32, mb: 1 }}
                />
                <Typography variant="caption" fontWeight={600}>
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
            {t('home.cta.title')}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            {t('home.cta.subtitle')}
          </Typography>
          <Button
            variant="contained"
            size="large"
            component={RouterLink}
            to="/register"
          >
            {t('home.cta.button')}
          </Button>
        </Container>
      </Box>

      {/* ==================== SECTION 9 — NEWSLETTER ==================== */}
      <Box sx={{ bgcolor: 'rgba(46, 125, 50, 0.04)', py: 6 }}>
        <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
          <Typography variant="h5" gutterBottom>
            {t('home.newsletter.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t('home.newsletter.subtitle')}
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
              placeholder={t('home.newsletter.placeholder')}
              label={t('home.newsletter.placeholder')}
              type="email"
              size="small"
              fullWidth
              sx={{ maxWidth: 320 }}
            />
            <Button variant="contained" disabled>
              {t('home.newsletter.subscribe')}
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
            {t('home.newsletter.disclaimer')}
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
