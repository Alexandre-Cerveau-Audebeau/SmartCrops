import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

export default function NotFound() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 2,
        textAlign: 'center',
        px: 2,
      }}
    >
      <Typography variant="h1" fontWeight={700} color="primary" sx={{ fontSize: { xs: '5rem', md: '8rem' } }}>
        404
      </Typography>
      <Typography variant="h5" fontWeight={600}>
        Oops — looks like this page didn&apos;t sprout.
      </Typography>
      <Typography variant="body1" color="text.secondary">
        The page you&apos;re looking for has gone to seed. Let&apos;s get you back to the garden.
      </Typography>
      <Button component={RouterLink} to="/" variant="contained" color="primary" size="large" sx={{ mt: 1 }}>
        Back to Home
      </Button>
    </Box>
  );
}
