import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Footer from './Footer';
import Navbar from './Navbar';
import BackToTop from '../BackToTop';
import DocumentHead from '../DocumentHead';

interface LayoutProps {
  children: ReactNode;
}

/** App shell: head manager, navbar, clipped main content, footer, back-to-top. */
export default function Layout({ children }: LayoutProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* SMA-354: single mount point for the per-route title/canonical manager. */}
      <DocumentHead />
      <Navbar />
      {/* Toolbar spacer pushes content below the fixed AppBar */}
      <Toolbar />
      {/* SMA-247 — page-level horizontal-scroll guard scoped to <main> ONLY.
          `overflow: clip` on an ANCESTOR of a fixed element breaks its paint in
          Chrome, so it must NOT sit on the shell (which wraps the fixed AppBar /
          back-to-top FAB). <main> is a sibling of those, so clipping it bounds the
          content's x-overflow without trapping them. `clip` (not hidden) creates
          no scroll container → sticky TOC pills stay intact; inner
          overflowX:auto/scroll wrappers (gallery, timeline…) keep their own
          scroll. The floating AI FAB lives inside the page content, so it is
          portalled out to <body> (see AiAssistantFab) to escape this clip. */}
      <Box component="main" sx={{ flexGrow: 1, overflowX: 'clip' }}>
        {children}
      </Box>
      <Footer />
      {/* SMA-126: global back-to-top FAB — one instance, every page. */}
      <BackToTop />
    </Box>
  );
}
