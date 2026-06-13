import Typography from '@mui/material/Typography';
import LegalText from './LegalText';

interface LegalParagraphProps {
  text: string;
}

/** SMA-35: one paragraph of legal prose (comfortable reading line-height). */
export default function LegalParagraph({ text }: LegalParagraphProps) {
  return (
    <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
      <LegalText text={text} />
    </Typography>
  );
}
