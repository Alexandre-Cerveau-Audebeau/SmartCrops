import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import OutlinedInput from '@mui/material/OutlinedInput';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';

const NAV_BG = '#1B5E3A';

const exploreLinks = [
  { label: 'Library', to: '/library' },
  { label: 'Plant Finder', to: '/finder' },
];

const aboutLinks = [
  { label: 'About Us', to: '/about' },
  { label: 'Contact', to: '/contact' },
  { label: 'Privacy', to: '/privacy' },
];

function FooterLink({ label, to }: { label: string; to: string }) {
  return (
    <Link
      component={RouterLink}
      to={to}
      underline="hover"
      sx={{ color: 'rgba(255,255,255,0.75)', display: 'block', mb: 0.75, fontSize: 14 }}
    >
      {label}
    </Link>
  );
}

export default function Footer() {
  return (
    <Box component="footer" sx={{ bgcolor: NAV_BG, color: '#fff', pt: 6, pb: 3 }}>
      <Container maxWidth="lg">
        <Grid container spacing={4}>
          {/* Column 1: Brand */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
              <Box component="img" src="/logo.png" alt="SmartCrops logo" sx={{ height: 36 }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                SmartCrops
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
              Your virtual garden companion — discover, grow, and share plants from around the world.
            </Typography>
          </Grid>

          {/* Column 2: Explore */}
          <Grid size={{ xs: 6, sm: 3, md: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, letterSpacing: 0.5 }}>
              EXPLORE
            </Typography>
            {exploreLinks.map((l) => (
              <FooterLink key={l.label} {...l} />
            ))}
          </Grid>

          {/* Column 3: About */}
          <Grid size={{ xs: 6, sm: 3, md: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, letterSpacing: 0.5 }}>
              ABOUT
            </Typography>
            {aboutLinks.map((l) => (
              <FooterLink key={l.label} {...l} />
            ))}
          </Grid>

          {/* Column 4: Connect */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, letterSpacing: 0.5 }}>
              CONNECT
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1.5 }}>
              Get plant tips and updates straight to your inbox.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <OutlinedInput
                placeholder="your@email.com"
                size="small"
                sx={{
                  flexGrow: 1,
                  bgcolor: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: 13,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.6)' },
                  '& input::placeholder': { color: 'rgba(255,255,255,0.5)' },
                }}
              />
              <Button variant="contained" color="primary" size="small" sx={{ whiteSpace: 'nowrap' }}>
                Subscribe
              </Button>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)', my: 4 }} />

        <Typography variant="body2" align="center" sx={{ color: 'rgba(255,255,255,0.5)' }}>
          © {new Date().getFullYear()} SmartCrops. All rights reserved.
        </Typography>
      </Container>
    </Box>
  );
}
