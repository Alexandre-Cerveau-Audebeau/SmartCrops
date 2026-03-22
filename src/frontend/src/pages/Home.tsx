import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function Home() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 2,
      }}
    >
      <Typography variant="h3" fontWeight={700} color="primary">
        SmartCrops
      </Typography>
      <Typography variant="h5" color="text.secondary">
        Coming Soon
      </Typography>
    </Box>
  );
}
