import { useTranslation } from 'react-i18next';
import Button from '@mui/material/Button';
import { useReconnect } from '../hooks/useReconnect';

/**
 * SMA-448, lot F3, step L4 (R3-E1) — « Se reconnecter », the one action a
 * surface offers once a request answered 401: ends the session and leads to
 * the login page (`useReconnect`). The same button wherever a session can
 * expire under a gesture — the creation of a garden, the save of a plan, the
 * change of formula — so the way back is the same everywhere.
 */
export default function ReconnectButton() {
  const { t } = useTranslation();
  const reconnect = useReconnect();
  return (
    <Button data-reconnect variant="outlined" size="small" onClick={() => void reconnect()} sx={{ textTransform: 'none' }}>
      {t('common.reconnect')}
    </Button>
  );
}
