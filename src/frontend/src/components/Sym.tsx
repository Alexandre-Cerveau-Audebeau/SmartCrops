/**
 * Material Symbols Outlined glyph (SMA-78). The font is loaded in index.html and
 * its base class lives in index.css; this renders one icon by its ligature name
 * (e.g. `spa`, `grass`, `schedule`). Decorative by default (`aria-hidden`), so it
 * never leaks an icon name to assistive tech — pair with a visible/labelled
 * sibling when the icon carries meaning.
 */
export function Sym({
  name,
  size = 20,
  color,
  ariaLabel,
}: {
  name: string;
  size?: number;
  color?: string;
  ariaLabel?: string;
}) {
  return (
    <span
      className="material-symbols-outlined"
      style={{ fontSize: size, color, lineHeight: 1 }}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel || undefined}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {name}
    </span>
  );
}
