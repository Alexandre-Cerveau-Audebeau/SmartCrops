import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ApiIcon from '@mui/icons-material/Api';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import Diversity3Icon from '@mui/icons-material/Diversity3';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import LockIcon from '@mui/icons-material/Lock';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import ComingSoonChip from '../components/ComingSoonChip';
import PlaceholderChip from '../components/Legal/PlaceholderChip';

/**
 * Stable Reason enum — this is the CONTRACT for the SMA-30 backend (SMTP).
 * Do NOT rename these values; the labels are i18n-driven but the values ship.
 */
export type ContactReason =
  | 'plant-data'
  | 'support'
  | 'partnership'
  | 'api'
  | 'privacy'
  | 'other';

const REASONS: ContactReason[] = [
  'plant-data',
  'support',
  'partnership',
  'api',
  'privacy',
  'other',
];

const reasonLabelKey: Record<ContactReason, string> = {
  'plant-data': 'contact.form.reasons.plantData',
  support: 'contact.form.reasons.support',
  partnership: 'contact.form.reasons.partnership',
  api: 'contact.form.reasons.api',
  privacy: 'contact.form.reasons.privacy',
  other: 'contact.form.reasons.other',
};

// Simulated-send latency (ms) before the success/error state shows (mockup B5).
const SEND_DELAY_MS = 1100;

/**
 * Temporary test harness for SMA-30: flip to true to exercise the server-error
 * state (mockup B7). Typed `boolean` (not the `false` literal) so both branches
 * stay reachable; unreachable in normal use. Remove when the real POST lands.
 */
const SIMULATE_SERVER_ERROR: boolean = false;

type FormStatus = 'idle' | 'sending' | 'success' | 'server-error';

interface FieldErrors {
  name?: string;
  email?: string;
  reason?: string;
  message?: string;
}

interface IntentCardDef {
  reason: ContactReason;
  icon: ReactNode;
  titleKey: string;
  descKey: string;
  ctaKey: string;
  cardComingSoon?: boolean;
  hintKey?: string;
  hintComingSoon?: boolean;
  privacyLink?: boolean;
}

const intentCards: IntentCardDef[] = [
  {
    reason: 'plant-data',
    icon: <LocalFloristIcon sx={{ fontSize: 36, color: 'primary.main' }} />,
    titleKey: 'contact.cards.plantData.title',
    descKey: 'contact.cards.plantData.desc',
    ctaKey: 'contact.cards.plantData.cta',
  },
  {
    reason: 'support',
    icon: <SupportAgentIcon sx={{ fontSize: 36, color: 'primary.main' }} />,
    titleKey: 'contact.cards.support.title',
    descKey: 'contact.cards.support.desc',
    ctaKey: 'contact.cards.support.cta',
    hintKey: 'contact.cards.support.hint',
    hintComingSoon: true,
  },
  {
    reason: 'partnership',
    icon: <Diversity3Icon sx={{ fontSize: 36, color: 'primary.main' }} />,
    titleKey: 'contact.cards.partnership.title',
    descKey: 'contact.cards.partnership.desc',
    ctaKey: 'contact.cards.partnership.cta',
  },
  {
    reason: 'api',
    icon: <ApiIcon sx={{ fontSize: 36, color: 'primary.main' }} />,
    titleKey: 'contact.cards.api.title',
    descKey: 'contact.cards.api.desc',
    ctaKey: 'contact.cards.api.cta',
    cardComingSoon: true,
  },
  {
    reason: 'privacy',
    icon: <LockIcon sx={{ fontSize: 36, color: 'primary.main' }} />,
    titleKey: 'contact.cards.privacy.title',
    descKey: 'contact.cards.privacy.desc',
    ctaKey: 'contact.cards.privacy.cta',
    privacyLink: true,
  },
  {
    reason: 'other',
    icon: (
      <ChatBubbleOutlineIcon sx={{ fontSize: 36, color: 'primary.main' }} />
    ),
    titleKey: 'contact.cards.other.title',
    descKey: 'contact.cards.other.desc',
    ctaKey: 'contact.cards.other.cta',
  },
];

// Client-side UX gate only — rejects obviously malformed addresses (requires a
// 2+ char TLD). The HTML5 type="email" input and the SMA-30 backend remain the
// authoritative validators.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * SMA-36: server-error panel (mockup B7). Exported so it can be unit-tested
 * directly — in normal use it is only reachable via the SIMULATE_SERVER_ERROR
 * harness (SMA-30 will wire the real failure path).
 */
export function ContactServerError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" size="small" onClick={onRetry}>
          {t('contact.serverError.tryAgain')}
        </Button>
      }
    >
      {t('contact.serverError.message')}
    </Alert>
  );
}

/** SMA-36: success panel (mockup B6). */
function ContactSuccess() {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the success heading so screen readers announce the state
  // change when the form is replaced by this panel.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <CheckCircleIcon color="success" sx={{ fontSize: 56, mb: 1.5 }} />
      <Typography
        ref={headingRef}
        tabIndex={-1}
        variant="h5"
        component="h2"
        sx={{ fontWeight: 700, mb: 1 }}
      >
        {t('contact.success.title')}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        {t('contact.success.body')}
      </Typography>
      <Button variant="contained" component={RouterLink} to="/">
        {t('contact.success.backHome')}
      </Button>
    </Box>
  );
}

/** SMA-36: /contact — intent-hub contact page (mockups B1-B7). */
export default function Contact() {
  const { t } = useTranslation();
  const formRef = useRef<HTMLDivElement>(null);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState<ContactReason | ''>('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<FormStatus>('idle');

  useEffect(() => {
    return () => {
      if (sendTimer.current) clearTimeout(sendTimer.current);
    };
  }, []);

  const selectIntent = (r: ContactReason) => {
    setReason(r);
    setErrors((prev) => ({ ...prev, reason: undefined }));
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = t('contact.form.errors.nameRequired');
    const trimmedEmail = email.trim();
    if (!trimmedEmail) next.email = t('contact.form.errors.emailRequired');
    else if (!EMAIL_RE.test(trimmedEmail))
      next.email = t('contact.form.errors.emailInvalid');
    if (!reason) next.reason = t('contact.form.errors.reasonRequired');
    if (!message.trim())
      next.message = t('contact.form.errors.messageRequired');
    return next;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Guard against re-entry while a send is in flight (the disabled button is
    // not bulletproof against rapid/keyboard submits) so we never orphan a timer.
    if (status === 'sending') return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setStatus('sending');
    if (sendTimer.current) clearTimeout(sendTimer.current);
    // TODO SMA-30: replace simulated success with real POST to the contact
    // endpoint (map server error -> 'server-error' state).
    sendTimer.current = setTimeout(() => {
      setStatus(SIMULATE_SERVER_ERROR ? 'server-error' : 'success');
    }, SEND_DELAY_MS);
  };

  const handleReasonChange = (e: SelectChangeEvent) => {
    setReason(e.target.value as ContactReason);
    setErrors((prev) => ({ ...prev, reason: undefined }));
  };

  const isSending = status === 'sending';

  return (
    <Box sx={{ bgcolor: 'background.default', py: { xs: 5, md: 7 } }}>
      <Container maxWidth="lg">
        {/* ===== HEADER ===== */}
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography
            variant="h3"
            component="h1"
            sx={{ fontWeight: 700, mb: 1 }}
          >
            {t('contact.title')}
          </Typography>
          <Typography
            variant="h6"
            color="text.secondary"
            sx={{ fontWeight: 400 }}
          >
            {t('contact.subtitle')}
          </Typography>
        </Box>

        {/* ===== INTENT CARDS ===== */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
            gap: 3,
            mb: 7,
          }}
        >
          {intentCards.map((card) => (
            <Card
              key={card.reason}
              variant="outlined"
              sx={{
                borderRadius: 3,
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                transition: 'box-shadow 0.2s',
                '&:hover': { boxShadow: 4 },
                ...(card.cardComingSoon && { borderStyle: 'dashed' }),
              }}
            >
              {card.cardComingSoon && (
                <ComingSoonChip
                  sx={{ position: 'absolute', top: 12, right: 12 }}
                />
              )}
              <CardContent
                sx={{
                  flexGrow: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                {card.icon}
                <Typography
                  variant="h6"
                  component="h2"
                  sx={{ fontWeight: 700 }}
                >
                  {t(card.titleKey)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t(card.descKey)}
                </Typography>
                {card.hintKey && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      mt: 0.5,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {t(card.hintKey)}
                    </Typography>
                    {card.hintComingSoon && <ComingSoonChip />}
                  </Box>
                )}
                {card.privacyLink && (
                  <Link
                    component={RouterLink}
                    to="/privacy"
                    variant="caption"
                    sx={{ mt: 0.5 }}
                  >
                    {t('contact.cards.privacy.privacyLink')}
                  </Link>
                )}
              </CardContent>
              <Box sx={{ px: 2, pb: 2 }}>
                <Button
                  variant="text"
                  onClick={() => selectIntent(card.reason)}
                  sx={{ fontWeight: 600 }}
                >
                  {t(card.ctaKey)}
                </Button>
              </Box>
            </Card>
          ))}
        </Box>

        {/* ===== FORM + GOOD TO KNOW ===== */}
        <Box
          ref={formRef}
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            scrollMarginTop: 80,
          }}
        >
          {/* --- Form --- */}
          <Paper
            variant="outlined"
            sx={{ flex: '1 1 480px', p: { xs: 2.5, md: 4 } }}
          >
            {status === 'success' ? (
              <ContactSuccess />
            ) : (
              <Box component="form" onSubmit={handleSubmit} noValidate>
                <Typography
                  variant="h5"
                  component="h2"
                  sx={{ fontWeight: 700, mb: 3 }}
                >
                  {t('contact.form.title')}
                </Typography>

                {status === 'server-error' && (
                  <Box sx={{ mb: 2 }}>
                    <ContactServerError onRetry={() => setStatus('idle')} />
                  </Box>
                )}

                <Box
                  sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}
                >
                  <TextField
                    label={t('contact.form.name')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    error={Boolean(errors.name)}
                    helperText={errors.name}
                    fullWidth
                    disabled={isSending}
                  />
                  <TextField
                    label={t('contact.form.email')}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    error={Boolean(errors.email)}
                    helperText={errors.email}
                    fullWidth
                    disabled={isSending}
                  />
                  <FormControl
                    fullWidth
                    error={Boolean(errors.reason)}
                    disabled={isSending}
                  >
                    <InputLabel id="contact-reason-label">
                      {t('contact.form.reason')}
                    </InputLabel>
                    <Select
                      labelId="contact-reason-label"
                      label={t('contact.form.reason')}
                      name="reason"
                      value={reason}
                      onChange={handleReasonChange}
                    >
                      {REASONS.map((r) => (
                        <MenuItem key={r} value={r}>
                          {t(reasonLabelKey[r])}
                        </MenuItem>
                      ))}
                    </Select>
                    {errors.reason && (
                      <FormHelperText>{errors.reason}</FormHelperText>
                    )}
                  </FormControl>
                  <TextField
                    label={t('contact.form.subject')}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    fullWidth
                    disabled={isSending}
                  />
                  <TextField
                    label={t('contact.form.message')}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    error={Boolean(errors.message)}
                    helperText={errors.message}
                    fullWidth
                    multiline
                    minRows={4}
                    disabled={isSending}
                  />
                  <Box>
                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      disabled={isSending}
                      startIcon={
                        isSending ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : undefined
                      }
                    >
                      {isSending
                        ? t('contact.form.sending')
                        : t('contact.form.send')}
                    </Button>
                  </Box>
                </Box>
              </Box>
            )}
          </Paper>

          {/* --- Good to know --- */}
          <Paper
            variant="outlined"
            sx={{
              flex: '1 1 260px',
              p: { xs: 2.5, md: 3 },
              alignSelf: 'flex-start',
              bgcolor: 'brandTintBg',
            }}
          >
            <Typography
              variant="h6"
              component="h2"
              sx={{ fontWeight: 700, mb: 2 }}
            >
              {t('contact.goodToKnow.title')}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {t('contact.goodToKnow.emailLabel')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  contact@smartcrops.fr <PlaceholderChip text="[À CONFIRMER]" />
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {t('contact.goodToKnow.replyTime')}
              </Typography>
              <Divider />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {t('contact.goodToKnow.faq')}
                </Typography>
                <ComingSoonChip />
              </Box>
              <Link component={RouterLink} to="/privacy" variant="body2">
                {t('contact.goodToKnow.privacyPolicy')}
              </Link>
            </Box>
          </Paper>
        </Box>
      </Container>
    </Box>
  );
}
