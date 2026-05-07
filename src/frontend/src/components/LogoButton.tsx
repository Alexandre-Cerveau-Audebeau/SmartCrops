import Box from '@mui/material/Box';
import { Link as RouterLink } from 'react-router-dom';

interface LogoButtonProps {
  height?: number;
  withHover?: boolean;
  noLink?: boolean;
}

export default function LogoButton({ height = 30, withHover = true, noLink = false }: LogoButtonProps) {
  const wrapperSx = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.95)',
    border: '1.5px solid rgba(0,0,0,0.08)',
    transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease',
    flexShrink: 0,
    ...(withHover && {
      '&:hover': {
        borderColor: 'rgba(0,0,0,0.15)',
        boxShadow: '0 0 8px rgba(78,175,120,0.35)',
        transform: 'scale(1.05)',
      },
    }),
  } as const;

  const img = (
    <Box
      component="img"
      src="/logo.png"
      alt="SmartCrops logo"
      sx={{ height, width: 'auto' }}
    />
  );

  if (noLink) {
    return <Box sx={wrapperSx}>{img}</Box>;
  }

  return (
    <Box
      component={RouterLink}
      to="/"
      aria-label="SmartCrops home"
      sx={wrapperSx}
    >
      {img}
    </Box>
  );
}
