import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import MenuIcon from '@mui/icons-material/Menu';
import GrassIcon from '@mui/icons-material/Grass';
import { NAV_BG } from '../../constants/colors';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import LogoButton from '../LogoButton';

const navLinks = [
  { key: 'nav.library', to: '/library', enabled: true, icon: <LocalFloristIcon sx={{ fontSize: 18 }} /> },
  { key: 'nav.myGardens', to: '/gardens', enabled: true, icon: <GrassIcon sx={{ fontSize: 18 }} /> },
];

export default function Navbar() {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { language, setLanguage } = useLanguage();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const toggleLanguage = () => setLanguage(language === 'en' ? 'fr' : 'en');

  const toggleDrawer = (open: boolean) => () => setDrawerOpen(open);

  const drawer = (
    <Box sx={{ width: 260 }} role="presentation">
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          bgcolor: NAV_BG,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LogoButton height={26} withHover={true} />
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
            SmartCrops
          </Typography>
        </Box>
        <IconButton onClick={toggleDrawer(false)} sx={{ color: '#fff' }} aria-label="Close menu">
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider />
      <List>
        {navLinks.map((link) => {
          const isActive = location.pathname.startsWith(link.to);
          return (
            <ListItem key={link.key} disablePadding>
              <ListItemButton
                component={RouterLink}
                to={link.to}
                disabled={!link.enabled}
                onClick={toggleDrawer(false)}
                aria-current={isActive ? 'page' : undefined}
                sx={{
                  bgcolor: isActive ? 'rgba(46,125,50,0.08)' : 'transparent',
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>{link.icon}</ListItemIcon>
                <ListItemText
                  primary={t(link.key)}
                  primaryTypographyProps={{ fontWeight: isActive ? 700 : 400 }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
      <Divider />
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Button variant="outlined" fullWidth onClick={toggleLanguage} aria-label={`Switch language (current: ${language.toUpperCase()})`}>
          <Box component="span" sx={{ fontWeight: language === 'fr' ? 700 : 400 }}>FR</Box>
          {' / '}
          <Box component="span" sx={{ fontWeight: language === 'en' ? 700 : 400 }}>EN</Box>
        </Button>
        {isAuthenticated ? (
          <>
            <Typography variant="body2" sx={{ textAlign: 'center', color: 'text.secondary' }}>
              {user?.email}
            </Typography>
            <Button variant="outlined" fullWidth onClick={() => { logout(); toggleDrawer(false)(); }}>
              {t('nav.logout')}
            </Button>
          </>
        ) : (
          <Button variant="contained" fullWidth component={RouterLink} to="/login" onClick={toggleDrawer(false)}>
            {t('nav.login')}
          </Button>
        )}
      </Box>
    </Box>
  );

  return (
    <>
      <AppBar position="fixed" sx={{ bgcolor: NAV_BG, boxShadow: 2 }}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          {/* Left: logo + brand */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <LogoButton height={30} withHover={true} />
            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, letterSpacing: 0.5 }}>
              SmartCrops
            </Typography>
          </Box>

          {isMobile ? (
            <IconButton onClick={toggleDrawer(true)} sx={{ color: '#fff' }} aria-label="Open menu">
              <MenuIcon />
            </IconButton>
          ) : (
            <>
              {/* Center: nav links */}
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {navLinks.map((link) => {
                  const isActive = location.pathname.startsWith(link.to);
                  return (
                    <Button
                      key={link.key}
                      component={RouterLink}
                      to={link.to}
                      disabled={!link.enabled}
                      aria-current={isActive ? 'page' : undefined}
                      sx={{
                        color: link.enabled ? '#fff' : 'rgba(255,255,255,0.4)',
                        opacity: isActive ? 1 : 0.7,
                        bgcolor: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                        borderRadius: 1,
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', opacity: 1 },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {link.icon}
                        {t(link.key)}
                      </Box>
                    </Button>
                  );
                })}
              </Box>

              {/* Right: language + auth */}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={toggleLanguage}
                  aria-label={`Switch language (current: ${language.toUpperCase()})`}
                  sx={{
                    color: '#fff',
                    borderColor: 'rgba(255,255,255,0.5)',
                    '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.1)' },
                  }}
                >
                  <Box component="span" sx={{ fontWeight: language === 'fr' ? 700 : 400, opacity: language === 'fr' ? 1 : 0.6 }}>FR</Box>
                  <Box component="span" sx={{ mx: 0.5 }}>/</Box>
                  <Box component="span" sx={{ fontWeight: language === 'en' ? 700 : 400, opacity: language === 'en' ? 1 : 0.6 }}>EN</Box>
                </Button>
                {isAuthenticated ? (
                  <>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                      {user?.email}
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={logout}
                      sx={{
                        color: '#fff',
                        borderColor: 'rgba(255,255,255,0.5)',
                        '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.1)' },
                      }}
                    >
                      {t('nav.logout')}
                    </Button>
                  </>
                ) : (
                  <Button variant="contained" color="secondary" size="small" component={RouterLink} to="/login">
                    {t('nav.login')}
                  </Button>
                )}
              </Box>
            </>
          )}
        </Toolbar>
      </AppBar>

      <Drawer anchor="left" open={drawerOpen} onClose={toggleDrawer(false)}>
        {drawer}
      </Drawer>
    </>
  );
}
