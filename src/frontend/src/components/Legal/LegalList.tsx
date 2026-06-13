import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LegalText from './LegalText';

interface LegalListProps {
  items: string[];
}

/** SMA-35: bulleted list of legal prose items. */
export default function LegalList({ items }: LegalListProps) {
  return (
    <Box
      component="ul"
      sx={{ m: 0, pl: 3, display: 'flex', flexDirection: 'column', gap: 1 }}
    >
      {items.map((item, i) => (
        <Typography
          key={i}
          component="li"
          variant="body1"
          sx={{ lineHeight: 1.75 }}
        >
          <LegalText text={item} />
        </Typography>
      ))}
    </Box>
  );
}
