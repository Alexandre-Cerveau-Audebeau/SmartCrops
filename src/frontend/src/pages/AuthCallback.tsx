import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAuth } from '../hooks/useAuth';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const { googleCallback } = useAuth();
  const navigate = useNavigate();
  const processed = useRef(false);

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token || processed.current) return;
    processed.current = true;

    try {
      googleCallback(token);
      navigate('/library', { replace: true });
    } catch {
      navigate('/login?error=invalid-token', { replace: true });
    }
  }, [token, googleCallback, navigate]);

  if (!token) {
    return (
      <Container maxWidth="xs" sx={{ pt: 8, textAlign: 'center' }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          No authentication token received
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/login')}>
          Back to Login
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="xs" sx={{ pt: 8 }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    </Container>
  );
}
