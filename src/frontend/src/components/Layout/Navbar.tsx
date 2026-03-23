import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import { NAV_BG } from '../../constants/colors';
import LogoButton from '../LogoButton';

const navLinks = [
  { label: 'Library', to: '/library', enabled: true },
  { label: 'My Gardens', to: '/gardens', enabled: false },
];

export default function Navbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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
        {navLinks.map((link) => (
          <ListItem key={link.label} disablePadding>
            <ListItemButton
              component={RouterLink}
              to={link.to}
              disabled={!link.enabled}
              onClick={toggleDrawer(false)}
            >
              <ListItemText primary={link.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider />
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Button variant="outlined" fullWidth>
          FR / EN
        </Button>
        <Button variant="contained" fullWidth>
          Login
        </Button>
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
                {navLinks.map((link) => (
                  <Button
                    key={link.label}
                    component={RouterLink}
                    to={link.to}
                    disabled={!link.enabled}
                    sx={{
                      color: link.enabled ? '#fff' : 'rgba(255,255,255,0.4)',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                    }}
                  >
                    {link.label}
                  </Button>
                ))}
              </Box>

              {/* Right: language + login */}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Button
                  variant="outlined"
                  size="small"
                  sx={{
                    color: '#fff',
                    borderColor: 'rgba(255,255,255,0.5)',
                    '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.1)' },
                  }}
                >
                  FR / EN
                </Button>
                <Button variant="contained" color="secondary" size="small">
                  Login
                </Button>
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
