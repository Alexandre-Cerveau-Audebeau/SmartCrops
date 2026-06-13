import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import LegalText from './LegalText';

interface ResponsiveLegalTableProps {
  ariaLabel: string;
  columns: string[];
  rows: string[][];
}

/**
 * SMA-35: legal data table — a real table on md+ screens, stacked cards on
 * mobile (one card per row, first column as the card title, remaining columns
 * as labelled fields). Rendered via useMediaQuery (not CSS display toggling)
 * so screen readers only ever see one copy of the content.
 */
export default function ResponsiveLegalTable({
  ariaLabel,
  columns,
  rows,
}: ResponsiveLegalTableProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  if (isDesktop) {
    return (
      <TableContainer>
        <Table size="small" aria-label={ariaLabel}>
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <TableCell key={col} sx={{ fontWeight: 700 }}>
                  {col}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i} sx={{ '&:last-child td': { border: 0 } }}>
                {row.map((cell, j) => (
                  <TableCell
                    key={j}
                    sx={{ verticalAlign: 'top', lineHeight: 1.6 }}
                  >
                    <LegalText text={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  return (
    <Box
      role="list"
      aria-label={ariaLabel}
      sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
    >
      {rows.map((row, i) => (
        <Box
          key={i}
          role="listitem"
          sx={{
            border: '1px solid rgba(0,0,0,0.12)',
            borderRadius: 2,
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            <LegalText text={row[0]} />
          </Typography>
          {row.slice(1).map((cell, j) => (
            <Box key={j}>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  display: 'block',
                }}
              >
                {columns[j + 1]}
              </Typography>
              <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                <LegalText text={cell} />
              </Typography>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
