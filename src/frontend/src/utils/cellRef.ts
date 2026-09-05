// Spreadsheet cell grammar for the garden grid — moved here from
// pages/gardenPlanner/placementGeometry.ts in review round 1 of SMA-18 lot 1:
// pure coordinate formatting with no planner state, shared by the placement
// panel (footprint line), the collision toasts and the components-layer
// RemovePlacementDialog, which must not reach into the page tree.

/** Column index → spreadsheet letter (0 → A, 25 → Z, 26 → AA). */
export function colToLetter(col: number): string {
  let letters = '';
  let n = col;
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

/** Grid cell reference in the mockup's "H3" style (column letter + 1-based row). */
export function cellRef(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`;
}
