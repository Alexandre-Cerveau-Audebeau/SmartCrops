import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import FacebookIcon from '@mui/icons-material/Facebook';
import InstagramIcon from '@mui/icons-material/Instagram';
import XIcon from '@mui/icons-material/X';
import YouTubeIcon from '@mui/icons-material/YouTube';
import { NAV_BG } from '../../constants/colors';
import { useAuth } from '../../hooks/useAuth';
import ComingSoonChip from '../ComingSoonChip';
import LogoButton from '../LogoButton';

/**
 * SMA-151: single footer link helper for both the column lists (block) and the
 * copyright-line legal links (inline) — resolves E7/SMA-159 (the legal links no
 * longer carry duplicated inline sx).
 */
function FooterLink({
  label,
  to,
  inline = false,
}: {
  label: string;
  to: string;
  inline?: boolean;
}) {
  return (
    <Link
      component={RouterLink}
      to={to}
      underline="hover"
      sx={{
        color: inline ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.75)',
        display: inline ? 'inline' : 'block',
        mb: inline ? 0 : 0.75,
        fontSize: 14,
        '&:hover': { color: '#fff' },
      }}
    >
      {label}
    </Link>
  );
}

/**
 * SMA-151: non-navigable "Coming Soon" footer item — renders as muted text + a
 * Coming Soon chip, NOT an <a>, so it is never a dead link (Help Center, News).
 */
function FooterComingSoonItem({ label }: { label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
      <Typography
        component="span"
        sx={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}
      >
        {label}
      </Typography>
      <ComingSoonChip />
    </Box>
  );
}

function FooterColumnHeading({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="subtitle2"
      component="h2"
      sx={{ fontWeight: 700, mb: 1.5, letterSpacing: 0.5 }}
    >
      {children}
    </Typography>
  );
}

const socialPlatforms = [
  { key: 'instagram', label: 'Instagram', Icon: InstagramIcon },
  { key: 'facebook', label: 'Facebook', Icon: FacebookIcon },
  { key: 'x', label: 'X', Icon: XIcon },
  { key: 'youtube', label: 'YouTube', Icon: YouTubeIcon },
];

export default function Footer() {
  const { t } = useTranslation();
  const { isAuthenticated, logout } = useAuth();

  const columnSx = { flex: '1 1 180px', minWidth: 150 } as const;

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // The user sees the logged-out state regardless (matches Navbar).
    }
  };

  return (
    <Box
      component="footer"
      sx={{ bgcolor: NAV_BG, color: '#fff', pt: 6, pb: 3 }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
          }}
        >
          {/* Column 1: Brand */}
          <Box sx={{ flex: '1 1 240px', minWidth: 200 }}>
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}
            >
              <LogoButton height={36} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                SmartCrops
              </Typography>
            </Box>
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, mb: 1.5 }}
            >
              {t('footer.tagline')}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'rgba(255,255,255,0.5)' }}
            >
              © {new Date().getFullYear()} SmartCrops
            </Typography>
          </Box>

          {/* Column 2: Explore */}
          <Box sx={columnSx}>
            <FooterColumnHeading>
              {t('footer.explore').toUpperCase()}
            </FooterColumnHeading>
            <FooterLink label={t('footer.library')} to="/library" />
            <FooterLink label={t('footer.myGardens')} to="/gardens" />
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                mb: 0.75,
              }}
            >
              <FooterLink label={t('footer.shop')} to="/shop" />
              <ComingSoonChip />
            </Box>
          </Box>

          {/* Column 3: Resources */}
          <Box sx={columnSx}>
            <FooterColumnHeading>
              {t('footer.resources').toUpperCase()}
            </FooterColumnHeading>
            <FooterLink label={t('footer.aboutUs')} to="/about" />
            <FooterComingSoonItem label={t('footer.helpCenter')} />
            <FooterComingSoonItem label={t('footer.news')} />
            <FooterLink label={t('footer.contact')} to="/contact" />
          </Box>

          {/* Column 4: Account (conditional) */}
          <Box sx={columnSx}>
            <FooterColumnHeading>
              {t('footer.account').toUpperCase()}
            </FooterColumnHeading>
            {isAuthenticated ? (
              <>
                <FooterLink label={t('footer.myAccount')} to="/profile" />
                <Button
                  variant="text"
                  onClick={handleLogout}
                  sx={{
                    color: 'rgba(255,255,255,0.75)',
                    p: 0,
                    minWidth: 0,
                    fontSize: 14,
                    fontWeight: 400,
                    textTransform: 'none',
                    justifyContent: 'flex-start',
                    '&:hover': {
                      bgcolor: 'transparent',
                      textDecoration: 'underline',
                    },
                  }}
                >
                  {t('footer.logout')}
                </Button>
              </>
            ) : (
              <>
                <FooterLink label={t('footer.login')} to="/login" />
                <FooterLink label={t('footer.createAccount')} to="/register" />
              </>
            )}
          </Box>

          {/* Column 5: Connect (social — Coming Soon, non-clickable) */}
          <Box sx={columnSx}>
            <FooterColumnHeading>
              {t('footer.connect').toUpperCase()}
            </FooterColumnHeading>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography
                variant="body2"
                sx={{ color: 'rgba(255,255,255,0.7)' }}
              >
                {t('footer.followUs')}
              </Typography>
              <ComingSoonChip />
            </Box>
            <Box
              role="list"
              aria-label={t('footer.socialAriaLabel')}
              sx={{ display: 'flex', gap: 1.5 }}
            >
              {socialPlatforms.map(({ key, label, Icon }) => (
                <Box
                  key={key}
                  role="listitem"
                  aria-label={label}
                  sx={{
                    color: 'rgba(255,255,255,0.35)',
                    display: 'inline-flex',
                  }}
                >
                  <Icon fontSize="small" aria-hidden="true" />
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)', my: 4 }} />

        {/* Copyright line — legal links factored through FooterLink (E7/SMA-159). */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap',
            columnGap: 1.5,
            rowGap: 0.5,
          }}
        >
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </Typography>
          {[
            { label: t('footer.legalNotice'), to: '/legal-notice' },
            { label: t('footer.termsOfUse'), to: '/terms' },
            { label: t('footer.privacy'), to: '/privacy' },
          ].map((legal) => (
            <Box
              key={legal.to}
              sx={{ display: 'flex', alignItems: 'center', columnGap: 1.5 }}
            >
              <Typography
                component="span"
                aria-hidden="true"
                sx={{ color: 'rgba(255,255,255,0.35)' }}
              >
                ·
              </Typography>
              <FooterLink label={legal.label} to={legal.to} inline />
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
