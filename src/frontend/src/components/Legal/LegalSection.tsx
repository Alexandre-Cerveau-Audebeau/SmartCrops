import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LegalText from './LegalText';

interface LegalSectionProps {
  number: string;
  title: string;
  children: ReactNode;
}

/**
 * SMA-35: one numbered section of a legal page — green section number,
 * bold title (parsed for placeholder markers, e.g. "Mineurs [OPTION]"),
 * then the section body.
 */
export default function LegalSection({
  number,
  title,
  children,
}: LegalSectionProps) {
  return (
    <Box component="section">
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 1.5 }}>
        <Typography
          component="span"
          aria-hidden="true"
          sx={{
            color: 'primary.main',
            fontWeight: 700,
            fontFamily: '"Roboto Mono", Consolas, monospace',
            fontSize: '1rem',
          }}
        >
          {number}
        </Typography>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          <LegalText text={title} />
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {children}
      </Box>
    </Box>
  );
}
