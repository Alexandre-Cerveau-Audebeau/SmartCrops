import { Component, type ErrorInfo, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * App-level error boundary. A render-time throw anywhere below it — e.g. a
 * malformed/partial API payload dereferenced without a guard — is caught here
 * and shown as a sober fallback instead of unmounting the entire React tree to
 * a blank page. Added after SMA-73, where a missing `translations` array on the
 * neutral list DTO (PR #100) crashed the Library with no boundary to contain it.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the error for diagnostics; a telemetry sink can hook in here later.
    console.error('Uncaught render error:', error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.hasError ? <ErrorFallback /> : this.props.children;
  }
}

/**
 * Fallback UI. Kept as a separate function component so it can use i18n hooks;
 * every label carries an inline default so the fallback still renders even if
 * the translation bundle is the very thing that failed.
 */
function ErrorFallback() {
  const { t } = useTranslation();
  return (
    <Box
      role="alert"
      sx={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        textAlign: 'center',
        px: 2,
      }}
    >
      <Typography variant="h5" fontWeight={600}>
        {t('errorBoundary.title', 'Something went wrong')}
      </Typography>
      <Typography color="text.secondary">
        {t('errorBoundary.message', 'An unexpected error occurred. Try reloading the page.')}
      </Typography>
      <Button variant="contained" onClick={() => window.location.reload()}>
        {t('errorBoundary.retry', 'Reload the page')}
      </Button>
    </Box>
  );
}
