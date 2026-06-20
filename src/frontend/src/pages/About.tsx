import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import GridOnIcon from '@mui/icons-material/GridOn';
import TranslateIcon from '@mui/icons-material/Translate';
import SensorsIcon from '@mui/icons-material/Sensors';
import ComingSoonChip from '../components/ComingSoonChip';
import LegalText from '../components/Legal/LegalText';
import { TECH_STACK } from '../constants/techStack';

interface Pillar {
  icon: ReactNode;
  titleKey: string;
  descKey: string;
  comingSoon?: boolean;
}

const pillars: Pillar[] = [
  {
    icon: <LocalFloristIcon sx={{ fontSize: 44, color: 'primary.main' }} />,
    titleKey: 'about.pillars.library.title',
    descKey: 'about.pillars.library.desc',
  },
  {
    icon: <GridOnIcon sx={{ fontSize: 44, color: 'primary.main' }} />,
    titleKey: 'about.pillars.planner.title',
    descKey: 'about.pillars.planner.desc',
  },
  {
    icon: <TranslateIcon sx={{ fontSize: 44, color: 'primary.main' }} />,
    titleKey: 'about.pillars.bilingual.title',
    descKey: 'about.pillars.bilingual.desc',
  },
  {
    icon: <SensorsIcon sx={{ fontSize: 44, color: 'primary.main' }} />,
    titleKey: 'about.pillars.intelligence.title',
    descKey: 'about.pillars.intelligence.desc',
    comingSoon: true,
  },
];

// Tech stack chip names, projected from the shared source of truth.
const techChips = TECH_STACK.map((tech) => tech.name);

// TODO: replace with Alexandre's garden photo. Reusing a vendored Unsplash hero
// image (real asset, credit kept) as the placeholder background.
const HERO_IMAGE = '/images/hero/hero-6.jpg';
const HERO_CREDIT = 'Jovana Askrabic';

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="h4"
      component="h2"
      color="primary"
      textAlign="center"
      sx={{ fontWeight: 700, mb: 3 }}
    >
      {children}
    </Typography>
  );
}

/** SMA-36: /about — About Us page (mockups A1/A3, photo hero). */
export default function About() {
  const { t } = useTranslation();

  return (
    <Box sx={{ bgcolor: 'background.default' }}>
      {/* ===== HERO (photo variant) ===== */}
      <Box
        sx={{
          position: 'relative',
          height: { xs: 320, md: 420 },
          overflow: 'hidden',
        }}
      >
        <Box
          component="img"
          src={HERO_IMAGE}
          alt={t('about.hero.imageAlt')}
          loading="eager"
          decoding="async"
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.6))',
          }}
        />
        <Container
          maxWidth="md"
          sx={{
            position: 'relative',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            color: '#fff',
          }}
        >
          <Typography
            variant="h3"
            component="h1"
            sx={{ fontWeight: 800, mb: 1.5 }}
          >
            {t('about.hero.title')}
          </Typography>
          <Typography
            variant="h6"
            sx={{ fontWeight: 400, opacity: 0.92, maxWidth: 620 }}
          >
            {t('about.hero.subtitle')}
          </Typography>
        </Container>
        <Typography
          sx={{
            position: 'absolute',
            bottom: 8,
            right: 16,
            color: 'rgba(255,255,255,0.6)',
            fontSize: 12,
          }}
        >
          {t('about.hero.photoCredit', { author: HERO_CREDIT })}
        </Typography>
      </Box>

      {/* ===== MISSION ===== */}
      <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
        <SectionHeading>{t('about.mission.title')}</SectionHeading>
        <Typography variant="body1" textAlign="center" sx={{ lineHeight: 1.8 }}>
          {t('about.mission.body')}
        </Typography>
      </Container>

      {/* ===== THE PROJECT ===== */}
      <Box sx={{ bgcolor: 'brandTintBg', py: { xs: 6, md: 8 } }}>
        <Container maxWidth="md">
          <SectionHeading>{t('about.project.title')}</SectionHeading>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
              <LegalText text={t('about.project.p1')} />
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
              <LegalText text={t('about.project.p2')} />
            </Typography>
          </Box>
        </Container>
      </Box>

      {/* ===== PILLARS ===== */}
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 } }}>
        <SectionHeading>{t('about.pillars.title')}</SectionHeading>
        <Typography
          variant="body1"
          textAlign="center"
          color="text.secondary"
          sx={{ mb: 5 }}
        >
          {t('about.pillars.subtitle')}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 3,
            justifyItems: 'center',
          }}
        >
          {pillars.map((pillar) => (
            <Card
              key={pillar.titleKey}
              variant="outlined"
              sx={{
                width: '100%',
                maxWidth: 360,
                borderRadius: 3,
                p: 3,
                textAlign: 'center',
                position: 'relative',
                transition: 'box-shadow 0.2s',
                '&:hover': { boxShadow: 4 },
                ...(pillar.comingSoon && {
                  borderStyle: 'dashed',
                  opacity: 0.9,
                }),
              }}
            >
              {pillar.comingSoon && (
                <ComingSoonChip
                  sx={{ position: 'absolute', top: 12, right: 12 }}
                />
              )}
              <CardContent>
                {pillar.icon}
                <Typography variant="h6" component="h3" sx={{ mt: 2, mb: 1 }}>
                  {t(pillar.titleKey)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t(pillar.descKey)}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Container>

      {/* ===== BUILT WITH ===== */}
      <Box sx={{ bgcolor: 'surfaceSubtle', py: { xs: 6, md: 8 } }}>
        <Container maxWidth="md">
          <SectionHeading>{t('about.builtWith.title')}</SectionHeading>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 1.5,
            }}
          >
            {techChips.map((name) => (
              <Chip
                key={name}
                label={name}
                sx={{
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  fontWeight: 600,
                }}
              />
            ))}
          </Box>
        </Container>
      </Box>

      {/* ===== CTA ===== */}
      <Box
        sx={{ bgcolor: 'primary.dark', color: '#fff', py: { xs: 6, md: 8 } }}
      >
        <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
          <Typography
            variant="h4"
            component="h2"
            sx={{ fontWeight: 700, mb: 3 }}
          >
            {t('about.cta.title')}
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
                '&:hover': {
                  borderColor: '#fff',
                  bgcolor: 'rgba(255,255,255,0.1)',
                },
              }}
            >
              {t('about.cta.browseLibrary')}
            </Button>
            <Button
              variant="contained"
              size="large"
              component={RouterLink}
              to="/register"
              sx={{
                bgcolor: '#fff',
                color: 'primary.dark',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' },
              }}
            >
              {t('about.cta.createAccount')}
            </Button>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
