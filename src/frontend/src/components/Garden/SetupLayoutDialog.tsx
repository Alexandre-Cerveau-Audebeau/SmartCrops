import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface Props {
  open: boolean;
  onConfirm: (width: number, height: number, cellSize: string) => void;
  onCancel: () => void;
  initialWidth?: number;
  initialHeight?: number;
  initialCellSize?: string;
  isEdit?: boolean;
}

const CELL_SIZES = ['25cm', '50cm', '1m'];

function cellSizeToMeters(cellSize: string): number {
  if (cellSize === '1m') return 1;
  if (cellSize === '50cm') return 0.5;
  return 0.25;
}

function SetupLayoutDialogInner({ onConfirm, onCancel, initialWidth, initialHeight, initialCellSize, isEdit }: Omit<Props, 'open'>) {
  const { t } = useTranslation();
  const [cols, setCols] = useState(initialWidth ?? 10);
  const [rows, setRows] = useState(initialHeight ?? 8);
  const [cellSize, setCellSize] = useState(initialCellSize ?? '50cm');

  const realDimensions = useMemo(() => {
    const m = cellSizeToMeters(cellSize);
    return `${(cols * m).toFixed(1)}m × ${(rows * m).toFixed(1)}m`;
  }, [cols, rows, cellSize]);

  return (
    <>
      <DialogTitle>{isEdit ? t('planner.setup.resizeTitle') : t('planner.setup.title')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '24px !important' }}>
        <TextField
          label={t('planner.setup.columns')}
          type="number"
          value={cols}
          onChange={(e) => setCols(Math.max(2, Math.min(50, Number(e.target.value) || 2)))}
          inputProps={{ min: 2, max: 50 }}
          InputLabelProps={{ shrink: true }}
          fullWidth
        />
        <TextField
          label={t('planner.setup.rows')}
          type="number"
          value={rows}
          onChange={(e) => setRows(Math.max(2, Math.min(50, Number(e.target.value) || 2)))}
          inputProps={{ min: 2, max: 50 }}
          InputLabelProps={{ shrink: true }}
          fullWidth
        />
        <TextField
          label={t('planner.setup.cellSize')}
          select
          value={cellSize}
          onChange={(e) => setCellSize(e.target.value)}
          fullWidth
        >
          {CELL_SIZES.map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
        <Typography variant="body2" color="text.secondary">
          {t('planner.setup.dimensions')}: {realDimensions}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t('planner.setup.cancel')}</Button>
        <Button variant="contained" onClick={() => onConfirm(cols, rows, cellSize)}>
          {isEdit ? t('planner.setup.apply') : t('planner.setup.create')}
        </Button>
      </DialogActions>
    </>
  );
}

export default function SetupLayoutDialog({ open, ...rest }: Props) {
  // Remount inner component each time dialog opens to reset state from props
  return (
    <Dialog open={open} onClose={rest.onCancel} maxWidth="xs" fullWidth>
      {open && <SetupLayoutDialogInner {...rest} />}
    </Dialog>
  );
}
