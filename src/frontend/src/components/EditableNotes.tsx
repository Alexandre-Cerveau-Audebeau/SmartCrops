import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';

interface EditableNotesProps {
  notes: string | null;
  onSave: (notes: string | null) => Promise<void>;
  disabled?: boolean;
}

export default function EditableNotes({ notes, onSave, disabled }: EditableNotesProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCancellingRef = useRef(false);
  const isSavingRef = useRef(false);

  const startEditing = () => {
    setValue(notes ?? '');
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    if (isSavingRef.current) return;
    const trimmed = value.trim();
    const newNotes = trimmed === '' ? null : trimmed;

    if (newNotes === (notes ?? null)) {
      setEditing(false);
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    setError(null);
    try {
      await onSave(newNotes);
      setEditing(false);
    } catch {
      setError('Failed to save notes.');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleBlur = () => {
    if (isCancellingRef.current) {
      setTimeout(() => {
        isCancellingRef.current = false;
      }, 0);
      return;
    }
    save();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  if (!editing) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontStyle: 'italic' }}
        >
          {notes ? `Notes: ${notes}` : 'Add notes...'}
        </Typography>
        <IconButton
          size="small"
          onClick={startEditing}
          disabled={disabled}
          aria-label="Edit notes"
        >
          <EditIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 1 }}>
      <TextField
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        variant="outlined"
        size="small"
        multiline
        maxRows={4}
        fullWidth
        autoFocus
        disabled={isSaving}
        inputProps={{ maxLength: 500 }}
        placeholder="Add notes..."
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
        <IconButton
          size="small"
          onMouseDown={(e) => e.preventDefault()}
          onClick={save}
          disabled={isSaving}
          aria-label="Save notes"
        >
          {isSaving ? <CircularProgress size={16} /> : <CheckIcon sx={{ fontSize: 16 }} />}
        </IconButton>
        <IconButton
          size="small"
          onMouseDown={() => {
            isCancellingRef.current = true;
          }}
          onClick={cancel}
          disabled={isSaving}
          aria-label="Cancel editing"
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
    </Box>
  );
}
