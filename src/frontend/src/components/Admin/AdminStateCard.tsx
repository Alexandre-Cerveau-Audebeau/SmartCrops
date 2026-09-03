import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';

interface AdminStateCardProps {
  /** `error` = danger-tinted icon ring (A3); `neutral` = subtle ring (A4). */
  tone: 'error' | 'neutral';
  icon: ReactNode;
  title: string;
  text: string;
  /** Optional pill under the text (« HTTP 403 »). */
  code?: string;
  /** The single call to action. */
  action: ReactNode;
}

/**
 * SMA-414 — centered state card shared by the load-error (A3) and 403 (A4)
 * states: icon ring, title, explanation, optional code pill, one button.
 * Colors come from the theme only (mode-aware through the palette).
 */
export default function AdminStateCard({
  tone,
  icon,
  title,
  text,
  code,
  action,
}: AdminStateCardProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        px: 3,
        pt: { xs: 4, md: 5 },
        pb: { xs: 8, md: 10 },
      }}
    >
      <Card
        variant="outlined"
        sx={{
          width: '100%',
          maxWidth: 520,
          textAlign: 'center',
          borderRadius: 3,
          borderColor: 'borderSubtle',
        }}
      >
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Box
            aria-hidden
            sx={{
              width: 56,
              height: 56,
              mx: 'auto',
              mb: 2,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: (theme) =>
                tone === 'error'
                  ? alpha(theme.palette.error.main, 0.12)
                  : theme.palette.surfaceSubtle,
              color: tone === 'error' ? 'error.main' : 'text.secondary',
            }}
          >
            {icon}
          </Box>
          <Typography variant="h6" component="h2" fontWeight={700} gutterBottom>
            {title}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {text}
          </Typography>
          {code && (
            <Box sx={{ mb: 2 }}>
              <Chip
                size="small"
                label={code}
                sx={{ bgcolor: 'surfaceSubtle', fontWeight: 700 }}
              />
            </Box>
          )}
          <Box>{action}</Box>
        </CardContent>
      </Card>
    </Box>
  );
}
