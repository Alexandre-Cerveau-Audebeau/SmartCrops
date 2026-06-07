import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Footer from './Footer';
import Navbar from './Navbar';
import BackToTop from '../BackToTop';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      {/* Toolbar spacer pushes content below the fixed AppBar */}
      <Toolbar />
      <Box component="main" sx={{ flexGrow: 1 }}>
        {children}
      </Box>
      <Footer />
      {/* SMA-126: global back-to-top FAB — one instance, every page. */}
      <BackToTop />
    </Box>
  );
}
