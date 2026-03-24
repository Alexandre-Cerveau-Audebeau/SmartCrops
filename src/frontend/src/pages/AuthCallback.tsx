import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import { useAuth } from '../hooks/useAuth';
import { exchangeCode } from '../services/authApi';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const { googleCallback } = useAuth();
  const navigate = useNavigate();
  const processed = useRef(false);

  const code = searchParams.get('code');
  const error = searchParams.get('error');

  useEffect(() => {
    if (processed.current) return;

    if (error) {
      processed.current = true;
      navigate(`/login?error=${error}`, { replace: true });
      return;
    }

    if (!code) {
      processed.current = true;
      navigate('/login?error=no-code', { replace: true });
      return;
    }

    processed.current = true;
    exchangeCode(code)
      .then(({ token }) => {
        googleCallback(token);
        navigate('/library', { replace: true });
      })
      .catch(() => {
        navigate('/login?error=invalid-code', { replace: true });
      });
  }, [code, error, googleCallback, navigate]);

  return (
    <Container maxWidth="xs" sx={{ pt: 8 }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    </Container>
  );
}
