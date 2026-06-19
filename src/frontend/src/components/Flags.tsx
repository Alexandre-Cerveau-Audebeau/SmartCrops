type FlagProps = { h?: number };

const STRIPE = 10 / 13;

export function FlagFr({ h = 13 }: FlagProps) {
  return (
    <svg
      width={h * 1.5}
      height={h}
      viewBox="0 0 3 2"
      role="img"
      aria-hidden="true"
      style={{ borderRadius: 2, display: 'block', flexShrink: 0 }}
    >
      <rect width="3" height="2" fill="#FFFFFF" />
      <rect width="1" height="2" x="0" fill="#0055A4" />
      <rect width="1" height="2" x="2" fill="#EF4135" />
    </svg>
  );
}

export function FlagUs({ h = 13 }: FlagProps) {
  return (
    <svg
      width={h * 1.9}
      height={h}
      viewBox="0 0 19 10"
      role="img"
      aria-hidden="true"
      style={{ borderRadius: 2, display: 'block', flexShrink: 0 }}
    >
      <rect width="19" height="10" fill="#FFFFFF" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect
          key={i}
          y={i * STRIPE}
          width="19"
          height={STRIPE}
          fill="#B22234"
        />
      ))}
      <rect width="8" height={7 * STRIPE} fill="#3C3B6E" />
      {[0.85, 2.4, 3.95, 5.5, 7.05].map((x) =>
        [0.9, 2.3, 3.7].map((y) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="0.32" fill="#FFFFFF" />
        ))
      )}
    </svg>
  );
}
