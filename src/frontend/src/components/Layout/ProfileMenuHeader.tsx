import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import EditIcon from '@mui/icons-material/Edit';
import PersonIcon from '@mui/icons-material/Person';

interface ProfileMenuHeaderProps {
  name: string;
  email: string;
  avatarSize?: number;
}

/**
 * SMA-152: shared rich header for the profile menu (desktop) and the drawer
 * profile section (mobile) — round Person avatar + name/email + a bordered
 * pencil affordance. The wrapping element (MenuItem / ListItemButton) is the
 * /profile edit link; the pencil here is decorative (aria-hidden) so the whole
 * row reads as a single focus target.
 */
export default function ProfileMenuHeader({
  name,
  email,
  avatarSize = 38,
}: ProfileMenuHeaderProps) {
  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}
    >
      <Box
        sx={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: '50%',
          bgcolor: 'brandTintBg',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <PersonIcon sx={{ fontSize: 21, color: 'primary.main' }} />
      </Box>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography
          sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}
          noWrap
        >
          {name}
        </Typography>
        {email && (
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }} noWrap>
            {email}
          </Typography>
        )}
      </Box>
      <Box
        aria-hidden="true"
        sx={{
          width: 32,
          height: 32,
          borderRadius: 2,
          border: '1.5px solid',
          borderColor: 'borderSubtle',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <EditIcon sx={{ fontSize: 16, color: 'primary.dark' }} />
      </Box>
    </Box>
  );
}
