import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

export default function PlantLibrary() {
  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Typography variant="h4" fontWeight={700} color="primary">
        Plant Library
      </Typography>
    </Container>
  );
}
