import Box from '@mui/material/Box';
import { Link as RouterLink } from 'react-router-dom';

interface LogoButtonProps {
  height?: number;
  withHover?: boolean;
}

export default function LogoButton({ height = 36, withHover = true }: LogoButtonProps) {
  return (
    <Box
      component={RouterLink}
      to="/"
      aria-label="SmartCrops home"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        height: 44,
        borderRadius: '50%',
        bgcolor: 'rgba(255,255,255,0.1)',
        transition: 'transform 0.2s ease, background 0.2s ease',
        flexShrink: 0,
        ...(withHover && {
          '&:hover': {
            bgcolor: 'rgba(255,255,255,0.2)',
            transform: 'scale(1.05)',
            filter: 'brightness(1.1)',
          },
        }),
      }}
    >
      <Box
        component="img"
        src="/logo.png"
        alt="SmartCrops logo"
        sx={{ height, width: 'auto' }}
      />
    </Box>
  );
}
