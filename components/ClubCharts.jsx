"use client";

// ============================================================
// Charts for the club-format pro forma.
//
// Hand-drawn SVG rather than a charting library. Three reasons:
// the app has no chart dependency and this doesn't add one, inline
// SVG survives the print pipeline where a canvas does not, and every
// fill is an explicit hex so the browser's ink-saving pass can't
// wash a bar out to white.
//
// Nothing here reads app state. Each chart takes numbers and draws.
// ============================================================

const GREEN = "#00A651";
const DARK = "#0A0A0A";
const RED = "#B91C1C";
const GREY = "#9AA3AB";
const LIGHT = "#E5E7EB";

const money = (n) =>
  Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}K` : `$${Math.round(n)}`;

function Frame({ width = 640, height = 220, children, label }) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="auto"
      role="img"
      aria-label={label}
      style={{ display: "block", maxWidth: "100%" }}
    >
      {children}
    </svg>
  );
}

// ---------- equity vs. property value ----------

// Two lines, and the gap between them is the point: gross property
// value on top, equity after the loan is repaid underneath. The
// published benchmark headline quotes the top line against the cash
// invested and never subtracts the debt, which is where its number
// comes from.
export function EquityCurve({ years, purchasePrice, equityBasis }) {
  const W = 640;
  const H = 240;
  const padL = 52;
  const padR = 12;
  const padT = 16;
  const padB = 28;

  const pts = [{ year: 0, value: purchasePrice, equity: equityBasis }].concat(
    years.map((r) => ({
      year: r.year,
      value: r.propertyValueEnd,
      equity: r.equityValueEnd,
    }))
  );

  const maxY = Math.max(...pts.map((p) => p.value)) * 1.08;
  const n = pts.length - 1;

  const x = (i) => padL + (i / n) * (W - padL - padR);
  const y = (v) => H - padB - (v / maxY) * (H - padT - padB);

  const line = (key) => pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[key])}`).join(" ");
  const area =
    pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.equity)}`).join(" ") +
    ` L${x(n)},${H - padB} L${x(0)},${H - padB} Z`;

  const ticks = [0, 0.5, 1].map((f) => maxY * f);

  return (
    <Frame width={W} height={H} label="Property value and equity over the hold period">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke={LIGHT} strokeWidth="1" />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill={GREY}>
            {money(t)}
          </text>
        </g>
      ))}

      <path d={area} fill={GREEN} fillOpacity="0.12" />
      <path d={line("value")} fill="none" stroke={GREY} strokeWidth="1.5" strokeDasharray="4 3" />
      <path d={line("equity")} fill="none" stroke={GREEN} strokeWidth="2.5" />

      {pts.map((p, i) =>
        i % 2 === 0 ? (
          <circle key={i} cx={x(i)} cy={y(p.equity)} r="3" fill={GREEN} />
        ) : null
      )}

      {pts.map((p, i) =>
        i % 2 === 0 ? (
          <text key={`l${i}`} x={x(i)} y={H - 10} textAnchor="middle" fontSize="9" fill={GREY}>
            {p.year}
          </text>
        ) : null
      )}

      <g transform={`translate(${padL + 6},${padT + 4})`}>
        <line x1="0" y1="0" x2="16" y2="0" stroke={GREEN} strokeWidth="2.5" />
        <text x="21" y="3" fontSize="9" fill={DARK}>
          Equity after debt
        </text>
        <line x1="118" y1="0" x2="134" y2="0" stroke={GREY} strokeWidth="1.5" strokeDasharray="4 3" />
        <text x="139" y="3" fontSize="9" fill={GREY}>
          Gross property value
        </text>
      </g>
    </Frame>
  );
}

// ---------- income waterfall ----------

// Gross scheduled rent on the left, what actually arrives on the
// right, and every deduction drawn to scale between them.
export function IncomeWaterfall({ income }) {
  const W = 640;
  const H = 200;
  const padT = 22;
  const padB = 34;

  const steps = [
    { label: "Gross\nscheduled", value: income.grossScheduledRent, type: "start" },
    { label: "Vacancy", value: -income.vacancyLoss, type: "down" },
    { label: "Collections", value: -income.collectionsLoss, type: "down" },
    { label: "Booking\nfees", value: -income.platformBookingFees, type: "down" },
    { label: "Service\nfee", value: -income.platformServiceFees, type: "down" },
    { label: "Net to\nowner", value: income.netToOwner, type: "end" },
  ];

  const maxV = income.grossScheduledRent * 1.05;
  const barW = (W - 24) / steps.length - 14;
  const scale = (v) => (v / maxV) * (H - padT - padB);

  let running = 0;
  const bars = steps.map((s, i) => {
    const x = 12 + i * ((W - 24) / steps.length) + 7;
    if (s.type === "start") {
      running = s.value;
      return { ...s, x, top: H - padB - scale(s.value), h: scale(s.value), fill: DARK };
    }
    if (s.type === "end") {
      return { ...s, x, top: H - padB - scale(s.value), h: scale(s.value), fill: GREEN };
    }
    const prev = running;
    running += s.value;
    return {
      ...s,
      x,
      top: H - padB - scale(prev),
      h: scale(-s.value),
      fill: RED,
      connector: H - padB - scale(prev),
    };
  });

  return (
    <Frame width={W} height={H} label="From gross scheduled rent to net to owner">
      <line x1="0" y1={H - padB} x2={W} y2={H - padB} stroke={LIGHT} strokeWidth="1" />
      {bars.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.top} width={barW} height={Math.max(1, b.h)} fill={b.fill} rx="1" />
          <text
            x={b.x + barW / 2}
            y={b.top - 5}
            textAnchor="middle"
            fontSize="9.5"
            fontWeight="700"
            fill={b.fill === RED ? RED : DARK}
          >
            {b.type === "down" ? `−${money(-b.value)}` : money(b.value)}
          </text>
          {b.label.split("\n").map((ln, k) => (
            <text
              key={k}
              x={b.x + barW / 2}
              y={H - padB + 13 + k * 9}
              textAnchor="middle"
              fontSize="8.5"
              fill={GREY}
            >
              {ln}
            </text>
          ))}
        </g>
      ))}
    </Frame>
  );
}

// ---------- expense composition ----------

// Ranked, because the order is the argument: utilities sit at the
// top and a flat monthly catch-all has to swallow all of it.
export function ExpenseBars({ expenses }) {
  const rows = [
    ["Utilities", expenses.utilities],
    ["Repairs & maintenance", expenses.repairsMaintenance],
    ["Common-area cleaning", expenses.commonAreaCleaning],
    ["Property taxes", expenses.propertyTaxes],
    ["Insurance", expenses.insurance],
    ["Capital reserve", expenses.capexReserve],
    ["Turnover", expenses.turnover],
    ["Landscaping & pest", expenses.landscapingPest],
    ["Supplies", expenses.supplies],
    ["Management", expenses.management],
  ]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const W = 640;
  const rowH = 19;
  const H = rows.length * rowH + 10;
  const labelW = 148;
  const max = Math.max(...rows.map((r) => r[1]));

  return (
    <Frame width={W} height={H} label="Operating expenses by line">
      {rows.map(([label, value], i) => {
        const w = (value / max) * (W - labelW - 68);
        return (
          <g key={label} transform={`translate(0,${i * rowH + 6})`}>
            <text x={labelW - 8} y="10" textAnchor="end" fontSize="9.5" fill={DARK}>
              {label}
            </text>
            <rect x={labelW} y="2" width={Math.max(1, w)} height="11" fill={GREEN} rx="1" />
            <text x={labelW + w + 6} y="11" fontSize="9" fontWeight="600" fill={GREY}>
              {money(value)}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

// ---------- cash-on-cash by year ----------

export function CashOnCashBars({ years }) {
  const W = 640;
  const H = 190;
  const padL = 40;
  const padB = 26;
  const padT = 18;

  const vals = years.flatMap((r) => [r.unleveredCashOnCash, r.leveredCashOnCash]);
  const max = Math.max(...vals) * 1.15;
  const min = Math.min(0, ...vals);
  const span = max - min;

  const slot = (W - padL - 12) / years.length;
  const barW = Math.min(13, slot / 2.6);
  const y = (v) => H - padB - ((v - min) / span) * (H - padT - padB);

  return (
    <Frame width={W} height={H} label="Cash-on-cash yield by year, unlevered and levered">
      <line x1={padL} y1={y(0)} x2={W - 8} y2={y(0)} stroke={LIGHT} strokeWidth="1" />
      {[max, (max + min) / 2].map((t, i) => (
        <text key={i} x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill={GREY}>
          {(t * 100).toFixed(0)}%
        </text>
      ))}

      {years.map((r, i) => {
        const cx = padL + i * slot + slot / 2;
        const u = r.unleveredCashOnCash;
        const l = r.leveredCashOnCash;
        return (
          <g key={r.year}>
            <rect
              x={cx - barW - 1.5}
              y={Math.min(y(u), y(0))}
              width={barW}
              height={Math.max(1, Math.abs(y(u) - y(0)))}
              fill={GREY}
              rx="1"
            />
            <rect
              x={cx + 1.5}
              y={Math.min(y(l), y(0))}
              width={barW}
              height={Math.max(1, Math.abs(y(l) - y(0)))}
              fill={l < 0 ? RED : GREEN}
              rx="1"
            />
            <text x={cx} y={H - 9} textAnchor="middle" fontSize="9" fill={GREY}>
              {r.year}
            </text>
          </g>
        );
      })}

      <g transform={`translate(${padL + 4},${padT - 6})`}>
        <rect width="10" height="10" fill={GREY} rx="1" />
        <text x="14" y="9" fontSize="9" fill={DARK}>
          Unlevered
        </text>
        <rect x="76" width="10" height="10" fill={GREEN} rx="1" />
        <text x="90" y="9" fontSize="9" fill={DARK}>
          Levered
        </text>
      </g>
    </Frame>
  );
}

// ---------- break-even ----------

// Cumulative levered position. It starts at minus the cash in and
// the crossing point is the month the deal has returned it.
export function BreakEvenCurve({ years, equityBasis, breakEvenMonths }) {
  const W = 640;
  const H = 190;
  const padL = 52;
  const padB = 26;
  const padT = 16;

  let cum = -equityBasis;
  const pts = [{ year: 0, v: cum }].concat(
    years.map((r) => {
      cum += r.leveredCashFlow;
      return { year: r.year, v: cum };
    })
  );

  const max = Math.max(...pts.map((p) => p.v));
  const min = Math.min(...pts.map((p) => p.v));
  const span = (max - min) * 1.1 || 1;
  const n = pts.length - 1;

  const x = (i) => padL + (i / n) * (W - padL - 12);
  const y = (v) => H - padB - ((v - min + span * 0.05) / span) * (H - padT - padB);

  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.v)}`).join(" ");
  const zeroY = y(0);

  return (
    <Frame width={W} height={H} label="Cumulative levered position by year">
      <line x1={padL} y1={zeroY} x2={W - 12} y2={zeroY} stroke={DARK} strokeWidth="1" />
      <text x={padL - 6} y={zeroY + 3} textAnchor="end" fontSize="9" fill={GREY}>
        $0
      </text>
      <text x={padL - 6} y={y(min) + 3} textAnchor="end" fontSize="9" fill={GREY}>
        {money(min)}
      </text>

      <path
        d={`${path} L${x(n)},${zeroY} L${x(0)},${zeroY} Z`}
        fill={GREEN}
        fillOpacity="0.1"
      />
      <path d={path} fill="none" stroke={GREEN} strokeWidth="2.5" />

      {breakEvenMonths != null && (
        <g>
          <line
            x1={x(breakEvenMonths / 12)}
            y1={padT}
            x2={x(breakEvenMonths / 12)}
            y2={H - padB}
            stroke={RED}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <text
            x={x(breakEvenMonths / 12) + 5}
            y={padT + 9}
            fontSize="9"
            fontWeight="700"
            fill={RED}
          >
            Break-even {breakEvenMonths} mo
          </text>
        </g>
      )}

      {pts.map((p, i) =>
        i % 2 === 0 ? (
          <text key={i} x={x(i)} y={H - 9} textAnchor="middle" fontSize="9" fill={GREY}>
            {p.year}
          </text>
        ) : null
      )}
    </Frame>
  );
}

// ---------- scenario comparison ----------

export function ScenarioCompare({ result, metric = "leveredIrr", format }) {
  const rows = [
    ["Bear", result.bear[metric], GREY],
    ["Base", result.base[metric], GREEN],
    ["Bull", result.bull[metric], DARK],
  ];

  const W = 640;
  const H = 92;
  const labelW = 46;
  const max = Math.max(...rows.map((r) => Math.abs(r[1]))) * 1.2 || 1;

  return (
    <Frame width={W} height={H} label="Scenario comparison">
      {rows.map(([label, value, fill], i) => {
        const w = (Math.abs(value) / max) * (W - labelW - 78);
        return (
          <g key={label} transform={`translate(0,${i * 28 + 6})`}>
            <text x={labelW - 8} y="14" textAnchor="end" fontSize="10" fontWeight="700" fill={DARK}>
              {label}
            </text>
            <rect x={labelW} y="3" width={Math.max(2, w)} height="15" fill={fill} rx="1" />
            <text x={labelW + w + 7} y="15" fontSize="10" fontWeight="700" fill={DARK}>
              {format(value)}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}
