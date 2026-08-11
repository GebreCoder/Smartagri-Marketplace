// ─── Lightweight SVG chart components (no external library) ───────
// Used by the new Farmer / Buyer dashboards.

const GREEN = "#16A34A";
const GRAY = "#94A3B8";

/* ── Sparkline (tiny trend line for KPI cards) ──────────────────── */
export function Sparkline({ values = [], color = GREEN, width = 84, height = 28 }) {
  const data = values.length ? values : [0, 0, 0, 0];
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = width / (data.length - 1 || 1);
  const points = data.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * (height - 4) - 2).toFixed(1)}`);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={width} cy={Number(points[points.length - 1]?.split(",")[1] || height / 2)} r="2.5" fill={color} />
    </svg>
  );
}

/* ── Area chart (sales & revenue) ───────────────────────────────── */
export function AreaChart({ labels = [], revenue = [], orders = [], height = 230 }) {
  const width = 560;
  const padL = 36;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const all = [...revenue, ...orders];
  const max = Math.max(...all, 1);
  const niceMax = Math.ceil(max / 1000) * 1000 || 1000;
  const stepX = innerW / Math.max(labels.length - 1, 1);

  const toX = (i) => padL + i * stepX;
  const toY = (v) => padT + innerH - (v / niceMax) * innerH;

  const revenuePath = revenue.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const ordersPath = orders.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");

  const areaPath =
    revenue.length > 1
      ? `${revenuePath} L${toX(revenue.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${padL},${(padT + innerH).toFixed(1)} Z`
      : "";

  const gridLines = [0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Sales and revenue chart">
      <defs>
        <linearGradient id="revArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16A34A" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#16A34A" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {gridLines.map((g) => (
        <line key={g} x1={padL} x2={width - padR} y1={padT + innerH - g * innerH} y2={padT + innerH - g * innerH} stroke="#EEF2F1" strokeWidth="1" />
      ))}

      {gridLines.map((g) => (
        <text key={g} x={padL - 8} y={padT + innerH - g * innerH + 4} textAnchor="end" fontSize="9" fill={GRAY}>
          {Math.round(niceMax * g) >= 1000 ? `${(niceMax * g / 1000).toFixed(1)}K` : Math.round(niceMax * g)}
        </text>
      ))}

      {labels.map((label, i) =>
        i % Math.ceil(labels.length / 7) === 0 || i === labels.length - 1 ? (
          <text key={label + i} x={toX(i)} y={height - 8} textAnchor="middle" fontSize="9" fill={GRAY}>
            {label}
          </text>
        ) : null
      )}

      {areaPath && <path d={areaPath} fill="url(#revArea)" />}
      {revenue.length > 1 && <path d={revenuePath} fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      {orders.length > 1 && <path d={ordersPath} fill="none" stroke="#F59E0B" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />}

      {revenue.length > 1 && <circle cx={toX(revenue.length - 1)} cy={toY(revenue[revenue.length - 1])} r="3.5" fill="#16A34A" stroke="#fff" strokeWidth="1.5" />}
      {orders.length > 1 && <circle cx={toX(orders.length - 1)} cy={toY(orders[orders.length - 1])} r="3" fill="#F59E0B" stroke="#fff" strokeWidth="1.5" />}
    </svg>
  );
}

/* ── Donut chart (farm performance) ─────────────────────────────── */
export function DonutChart({ items = [], size = 150, thickness = 20, centerLabel = "Total", centerValue = "0" }) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Production breakdown donut">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EEF2F1" strokeWidth={thickness} />
        {items.map((item) => {
          const length = (item.pct / 100) * circumference;
          const dash = `${length} ${circumference - length}`;
          const dashOffset = -offset;
          offset += length;
          return (
            <circle
              key={item.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={item.color || GREEN}
              strokeWidth={thickness}
              strokeDasharray={dash}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 900, color: "#0F172A", lineHeight: 1.15 }}>{centerValue}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: GRAY, marginTop: 2 }}>{centerLabel}</div>
      </div>
    </div>
  );
}

/* ── Bar chart (buyer spending) ─────────────────────────────────── */
export function BarChart({ labels = [], values = [], height = 190, color = GREEN }) {
  const width = 320;
  const padL = 30;
  const padR = 8;
  const padT = 12;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(...values, 1);
  const slot = innerW / labels.length;
  const barW = Math.min(26, slot * 0.5);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Spending bar chart">
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={padL} x2={width - padR} y1={padT + innerH - g * innerH} y2={padT + innerH - g * innerH} stroke="#EEF2F1" strokeWidth="1" />
      ))}
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <text key={g} x={padL - 6} y={padT + innerH - g * innerH + 4} textAnchor="end" fontSize="9" fill={GRAY}>
          {Math.round(max * g) >= 1000 ? `${(max * g / 1000).toFixed(1)}K` : Math.round(max * g)}
        </text>
      ))}
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * innerH);
        const x = padL + i * slot + (slot - barW) / 2;
        return (
          <g key={i}>
            <rect x={x} y={padT + innerH - h} width={barW} height={h} rx="4" fill={color} opacity={0.9} />
            <text x={padL + i * slot + slot / 2} y={height - 6} textAnchor="middle" fontSize="9" fill={GRAY}>
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Progress bar (crops) ───────────────────────────────────────── */
export function ProgressBar({ value = 0, color = GREEN, height = 8, showLabel = false }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
      <div style={{ flex: 1, height, background: "#EEF2F1", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999, transition: "width .4s ease" }} />
      </div>
      {showLabel && <span style={{ fontSize: 11, fontWeight: 800, color: "#0F172A", minWidth: 30, textAlign: "right" }}>{pct}%</span>}
    </div>
  );
}
