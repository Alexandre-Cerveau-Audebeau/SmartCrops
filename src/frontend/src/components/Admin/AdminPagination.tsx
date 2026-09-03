import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

interface AdminPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
}

/**
 * SMA-414 (D5) — « 1–25 sur 127 · Page 1 / 6 · Précédent / Suivant ». Shown
 * only above the pagination threshold; the single interactive command of the
 * dashboard.
 */
export default function AdminPagination({
  page,
  pageSize,
  total,
  disabled = false,
  onPageChange,
}: AdminPaginationProps) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <Box
      component="nav"
      aria-label={t('admin.pagination.page', { page, pages })}
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1.5,
        px: { xs: 1.5, md: 2.25 },
        py: 1.5,
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Typography variant="body2" fontWeight={700}>
        {t('admin.pagination.range', { from, to, total })}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('admin.pagination.page', { page, pages })}
      </Typography>
      <Box sx={{ flex: 1 }} />
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        startIcon={<ChevronLeftIcon />}
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {t('admin.pagination.previous')}
      </Button>
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        endIcon={<ChevronRightIcon />}
        disabled={disabled || page >= pages}
        onClick={() => onPageChange(page + 1)}
      >
        {t('admin.pagination.next')}
      </Button>
    </Box>
  );
}
