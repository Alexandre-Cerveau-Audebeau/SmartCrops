import { useState } from 'react';
import Box from '@mui/material/Box';
import ReorderableList from '../../components/Dashboard/ReorderableList';

/**
 * SMA-437 lot 1, PR B, round 1, S1 — the real `ReorderableList`, owning its
 * order the way the Key figures panel owns it, for the harness's focus probe.
 * Its own file: the probe's driver is a script, this is a component.
 */
export default function FocusProbeList({ rows }: { rows: readonly string[] }) {
  const [items, setItems] = useState([...rows]);
  return (
    <Box data-focus-probe sx={{ width: 320, p: '12px' }}>
      <ReorderableList
        items={items}
        getId={(name) => name}
        getName={(name) => name}
        placeOf={(index) => String(index + 1)}
        label="focus probe"
        renderRow={(name) => <span data-focus-probe-name>{name}</span>}
        onAnnounce={() => {}}
        onMove={(from, to) =>
          setItems((current) => {
            const next = [...current];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved!);
            return next;
          })
        }
      />
    </Box>
  );
}
