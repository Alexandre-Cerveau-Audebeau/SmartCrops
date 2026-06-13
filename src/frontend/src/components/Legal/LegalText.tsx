import { Fragment } from 'react';
import PlaceholderChip from './PlaceholderChip';

/**
 * Tokenizes legal copy: placeholder markers become PlaceholderChip, **bold**
 * runs become <strong>. The single capture group means tokens land at odd
 * indices after split().
 */
const TOKEN_RE =
  /(\[(?:À REMPLIR|À CONFIRMER|À ACTIVER|OPTION)[^\]]*\]|\*\*[^*]+\*\*)/g;

interface LegalTextProps {
  text: string;
}

/**
 * SMA-35: renders a legal i18n string, turning [À …]/[OPTION…] markers into
 * placeholder chips and **…** runs into bold. Bold content is re-parsed so a
 * placeholder wrapped in bold still renders as a chip.
 */
export default function LegalText({ text }: LegalTextProps) {
  return (
    <>
      {text.split(TOKEN_RE).map((part, i) => {
        if (i % 2 === 0) {
          return <Fragment key={i}>{part}</Fragment>;
        }
        if (part.startsWith('**')) {
          return (
            <strong key={i}>
              <LegalText text={part.slice(2, -2)} />
            </strong>
          );
        }
        return <PlaceholderChip key={i} text={part} />;
      })}
    </>
  );
}
