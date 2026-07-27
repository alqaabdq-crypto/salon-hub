// Server-rendered SVG bar chart of monthly net revenue. Single series, so no
// legend — the heading names it. Bars carry the one brand hue; every number and
// label wears an ink token, never the series colour. Per-bar value labels double
// as the accessible data (the site is server-rendered / no-JS), and the Revenue
// tab is the full table view.
export type RevenueBar = { label: string; value: number; display: string };

const W = 360;
const H = 200;
const PAD_X = 12;
const PAD_TOP = 30;
const PAD_BOTTOM = 26;
const BASELINE = H - PAD_BOTTOM;
const PLOT_H = BASELINE - PAD_TOP;

export function RevenueChart({
  bars,
  ariaSummary,
}: {
  bars: RevenueBar[];
  ariaSummary: string;
}) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  const slot = (W - PAD_X * 2) / bars.length;
  const barW = Math.min(34, slot * 0.56);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={ariaSummary}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Recessive baseline. */}
      <line
        x1={PAD_X}
        y1={BASELINE}
        x2={W - PAD_X}
        y2={BASELINE}
        className="stroke-hairline"
        strokeWidth={1}
      />

      {bars.map((bar, i) => {
        const cx = PAD_X + i * slot + slot / 2;
        const barH = bar.value > 0 ? (bar.value / max) * PLOT_H : 0;
        const y = BASELINE - barH;

        return (
          <g key={bar.label + i}>
            {barH > 0 && (
              <rect
                x={cx - barW / 2}
                y={y}
                width={barW}
                height={barH}
                rx={4}
                className="fill-brand"
              />
            )}
            {bar.value > 0 && (
              <text
                x={cx}
                y={y - 7}
                textAnchor="middle"
                className="fill-foreground"
                fontSize={11}
                fontWeight={600}
              >
                {bar.display}
              </text>
            )}
            <text
              x={cx}
              y={BASELINE + 16}
              textAnchor="middle"
              className="fill-muted"
              fontSize={11}
            >
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
