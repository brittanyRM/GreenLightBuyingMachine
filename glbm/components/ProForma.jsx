"use client";

import { useState, useMemo } from "react";
import {
  computeProForma,
  snapshotOutputs,
  resolveAssumptions,
  estimateTaxes,
  usd,
  pct,
} from "../lib/proforma";
import { createSnapshot } from "../lib/queries";

const GREEN = "#00A651";

function Field({ label, value, onChange, prefix, suffix, step = 1, hint }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </span>
      <div className="mt-1 flex items-center rounded border border-neutral-700 bg-neutral-900 focus-within:border-[#00A651]">
        {prefix && <span className="pl-2 text-sm text-neutral-500">{prefix}</span>}
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-transparent px-2 py-1.5 text-sm text-white outline-none"
        />
        {suffix && <span className="pr-2 text-sm text-neutral-500">{suffix}</span>}
      </div>
      {hint && <span className="mt-0.5 block text-[10px] text-neutral-500">{hint}</span>}
    </label>
  );
}

function Row({ label, monthly, annual, tone = "normal", note }) {
  const styles = { normal: "text-neutral-800", minus: "text-neutral-600", total: "font-bold text-neutral-900" };
  return (
    <div className={`flex items-baseline gap-3 py-1.5 ${tone === "total" ? "border-b-2 border-neutral-900" : "border-b border-neutral-200"}`}>
      <div className={`flex-1 text-[13px] ${styles[tone]}`}>
        {label}
        {note && <span className="ml-1.5 text-[11px] text-neutral-400">{note}</span>}
      </div>
      <div className={`w-24 text-right text-[13px] tabular-nums ${styles[tone]}`}>{monthly}</div>
      <div className={`w-28 text-right text-[13px] tabular-nums ${styles[tone]}`}>{annual}</div>
    </div>
  );
}

function Stat({ label, value, sub, good }) {
  return (
    <div className="border-l-2 pl-3" style={{ borderColor: good === false ? "#B91C1C" : GREEN }}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">{label}</div>
      <div className="text-xl font-bold tabular-nums text-neutral-900">{value}</div>
      {sub && <div className="text-[11px] text-neutral-500">{sub}</div>}
    </div>
  );
}

export default function ProForma({ deal, rooms = [], market = null, comps = [], orgRows = null, readOnly = false }) {
  const A = resolveAssumptions(deal, orgRows);
  const [scenario, setScenario] = useState("glbm");
  const [showInputs, setShowInputs] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);

  const [ov, setOv] = useState({
    price: Number(deal.list_price ?? deal.purchase_price ?? 0),
    ltv: A.ltv,
    rate: A.interest_rate,
    term: A.loan_term_years,
    points: A.origination_points,
    closingCosts: A.closing_costs,
    sharedRate: market?.shared_weekly ?? 0,
    ensuiteRate: market?.private_weekly ?? 0,
    padsplitFee: A.padsplit_fee,
    mgmtFee: A.management_fee,
    maintFee: A.maintenance_rate,
    power: A.util_power,
    wst: A.util_wst,
    wifi: A.util_wifi,
    cleaning: A.util_cleaning,
    taxes: estimateTaxes(deal, A),
    insurance: A.insurance_annual,
    appreciation: A.appreciation_rate,
  });
  const set = (k) => (v) => setOv((p) => ({ ...p, [k]: v }));
  const setPctField = (k) => (v) => setOv((p) => ({ ...p, [k]: v / 100 }));

  const p = useMemo(
    () => computeProForma({ deal, rooms, market, comps, orgRows, scenario, overrides: ov }),
    [deal, rooms, market, comps, orgRows, scenario, ov]
  );

  const ma = (n) => [usd(n), usd(n * 12)];
  const sqft = p.sqft;

  async function handleShare() {
    const snap = await createSnapshot({
      dealId: deal.id,
      scenario,
      inputs: ov,
      outputs: snapshotOutputs(p),
    });
    setShareUrl(`${window.location.origin}/p/${snap.share_token}`);
  }

  return (
    <div className="bg-neutral-100 p-4 font-sans sm:p-8">
      <div className="mx-auto max-w-4xl bg-white shadow-xl">
        <div className="bg-neutral-950 px-6 py-5 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GREEN }}>
                Green Light Buying Machine
              </div>
              <h1 className="mt-1 text-2xl font-bold leading-none text-white sm:text-3xl">{deal.address_line}</h1>
              <div className="mt-1 text-sm text-neutral-400">
                {deal.city}, {deal.state} {deal.zip} · {p.mix.bedrooms} bed / {deal.bathrooms} bath
                {sqft ? ` · ${sqft.toLocaleString()} sq ft` : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Turnkey price</div>
              <div className="text-3xl font-bold tabular-nums text-white">{usd(p.price)}</div>
              {deal.disposition_coe && (
                <div className="text-[11px] text-neutral-400">
                  Ready {new Date(deal.disposition_coe + "T12:00:00").toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-b border-neutral-200 px-6 py-5 sm:grid-cols-4 sm:px-8">
          <Stat label="Monthly cash flow" value={usd(p.cashFlow)} sub={`${usd(p.cashFlow * 12)} / yr`} good={p.cashFlow > 0} />
          <Stat label="Cash on cash" value={pct(p.coc)} sub={`on ${usd(p.cashIn)} in`} good={p.coc > 0} />
          <Stat label="Cap rate" value={pct(p.capRate)} sub={`${pct(p.grossYield)} gross yield`} />
          <Stat label="DSCR" value={p.dscr.toFixed(2)} sub={p.dscr >= 1.2 ? "lender-ready" : "below 1.20"} good={p.dscr >= 1.2} />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-6 py-3 sm:px-8">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Occupancy basis</span>
          {[
            { id: "glbm", label: `GLBM underwriting — ${pct(A.vacancy_rate, 0)} vacancy` },
            { id: "market", label: `${deal.zip} actual — ${pct(p.marketVacancy, 0)} vacancy` },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setScenario(s.id)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${scenario === s.id ? "text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-300"}`}
              style={scenario === s.id ? { backgroundColor: GREEN } : {}}
            >
              {s.label}
            </button>
          ))}
          {!readOnly && (
            <div className="ml-auto flex gap-3">
              <button onClick={handleShare} className="text-[11px] font-semibold text-neutral-600 underline underline-offset-2">
                Buyer link
              </button>
              <button onClick={() => setShowInputs((v) => !v)} className="text-[11px] font-semibold text-neutral-600 underline underline-offset-2">
                {showInputs ? "Hide assumptions" : "Edit assumptions"}
              </button>
            </div>
          )}
        </div>

        {shareUrl && (
          <div className="border-b border-neutral-200 bg-neutral-50 px-6 py-2 text-[11px] sm:px-8">
            <span className="text-neutral-500">Buyer link: </span>
            <code className="text-neutral-800">{shareUrl}</code>
          </div>
        )}

        {showInputs && (
          <div className="grid grid-cols-2 gap-3 bg-neutral-950 px-6 py-5 sm:grid-cols-4 sm:px-8">
            <Field label="Price" prefix="$" step={5000} value={ov.price} onChange={set("price")} />
            <Field label="LTV" suffix="%" value={ov.ltv * 100} onChange={setPctField("ltv")} />
            <Field label="Rate" suffix="%" step={0.125} value={ov.rate * 100} onChange={setPctField("rate")} />
            <Field label="Term" suffix="yr" value={ov.term} onChange={set("term")} />
            <Field label="Points" suffix="%" step={0.25} value={ov.points * 100} onChange={setPctField("points")} />
            <Field label="Closing costs" prefix="$" step={500} value={ov.closingCosts} onChange={set("closingCosts")} />
            <Field label="Shared rate" prefix="$" suffix="/wk" value={ov.sharedRate} onChange={set("sharedRate")} />
            <Field label="Ensuite rate" prefix="$" suffix="/wk" value={ov.ensuiteRate} onChange={set("ensuiteRate")} />
            <Field label="PadSplit fee" suffix="%" value={ov.padsplitFee * 100} onChange={setPctField("padsplitFee")} />
            <Field label="Management" suffix="%" value={ov.mgmtFee * 100} onChange={setPctField("mgmtFee")} />
            <Field label="Maintenance" suffix="%" value={ov.maintFee * 100} onChange={setPctField("maintFee")} />
            <Field label="Power" prefix="$" suffix="/mo" value={ov.power} onChange={set("power")} />
            <Field label="Water/sewer/trash" prefix="$" suffix="/mo" value={ov.wst} onChange={set("wst")} />
            <Field label="WiFi" prefix="$" suffix="/mo" value={ov.wifi} onChange={set("wifi")} />
            <Field label="Cleaning" prefix="$" suffix="/mo" value={ov.cleaning} onChange={set("cleaning")} />
            <Field label="Taxes" prefix="$" suffix="/yr" step={100} value={ov.taxes} onChange={set("taxes")} hint={deal.assessed_tax_amount ? `Last bill ${usd(deal.assessed_tax_amount)}` : null} />
            <Field label="Insurance" prefix="$" suffix="/yr" step={100} value={ov.insurance} onChange={set("insurance")} />
            <Field label="Appreciation" suffix="%" value={ov.appreciation * 100} onChange={setPctField("appreciation")} />
          </div>
        )}

        <div className="grid gap-8 px-6 py-6 sm:px-8 md:grid-cols-2">
          <div>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em]">Room revenue stack</h2>
            <div className="mb-5 space-y-1.5">
              {[
                { list: p.mix.ensuite, label: "Ensuite — private bath", rate: ov.ensuiteRate, fill: GREEN },
                { list: p.mix.shared, label: "Shared bath", rate: ov.sharedRate, fill: "#1F2937" },
              ]
                .filter((g) => g.list.length)
                .map((g) => (
                  <div key={g.label} className="flex items-center gap-2">
                    <div className="flex flex-wrap gap-0.5">
                      {g.list.map((r) => (
                        <div key={r.id || r.room_number} title={`${r.label}${r.bath_label ? ` · ${r.bath_label}` : ""}`} className="h-6 w-3 rounded-sm" style={{ backgroundColor: g.fill }} />
                      ))}
                    </div>
                    <div className="text-[11px] text-neutral-600">
                      <span className="font-semibold text-neutral-900">{g.list.length}×</span> {g.label} · {usd(g.rate)}/wk
                    </div>
                  </div>
                ))}
              <div className="pt-1 text-[11px] text-neutral-500">
                {usd(p.grossWeekly)}/week gross{sqft > 0 && ` · ${usd(p.rentPerSqft, 2)} per sq ft/mo`}
              </div>
            </div>

            <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em]">Income</h2>
            <div className="mb-1 flex gap-3 border-b border-neutral-900 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              <div className="flex-1" />
              <div className="w-24 text-right">Monthly</div>
              <div className="w-28 text-right">Annual</div>
            </div>
            <Row label="Gross scheduled rent" monthly={ma(p.grossMonthly)[0]} annual={ma(p.grossMonthly)[1]} />
            <Row label="Vacancy" note={`@ ${pct(p.vacancy, 0)}`} tone="minus" monthly={`(${usd(p.vacancyLoss)})`} annual={`(${usd(p.vacancyLoss * 12)})`} />
            <Row label="Operating income" tone="total" monthly={ma(p.collected)[0]} annual={ma(p.collected)[1]} />

            <h2 className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-[0.15em]">Operating expenses</h2>
            <Row label="PadSplit fee" tone="minus" monthly={`(${usd(p.feePadsplit)})`} annual={`(${usd(p.feePadsplit * 12)})`} />
            <Row label="Property management" tone="minus" monthly={`(${usd(p.feeMgmt)})`} annual={`(${usd(p.feeMgmt * 12)})`} />
            <Row label="Maintenance / R&M" tone="minus" monthly={`(${usd(p.feeMaint)})`} annual={`(${usd(p.feeMaint * 12)})`} />
            <Row label="Utilities, WiFi, cleaning" tone="minus" monthly={`(${usd(p.utilities)})`} annual={`(${usd(p.utilities * 12)})`} />
            <Row label="Taxes & insurance" tone="minus" monthly={`(${usd(p.fixed)})`} annual={`(${usd(p.fixed * 12)})`} />
            <Row label="Total operating expenses" tone="total" monthly={`(${usd(p.opex)})`} annual={`(${usd(p.opex * 12)})`} />

            <h2 className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-[0.15em]">Net performance</h2>
            <Row label="Net operating income" monthly={ma(p.noi)[0]} annual={ma(p.noi)[1]} />
            <Row label="Debt service" note={`${(p.rate * 100).toFixed(3)}% / ${p.term} yr`} tone="minus" monthly={`(${usd(p.payment)})`} annual={`(${usd(p.payment * 12)})`} />
            <Row label="Cash flow" tone="total" monthly={ma(p.cashFlow)[0]} annual={ma(p.cashFlow)[1]} />
            <Row label="+ Principal reduction" monthly={usd(p.year1Principal / 12)} annual={usd(p.year1Principal)} />
            <Row label="+ Depreciation" monthly={usd(p.depreciation / 12)} annual={usd(p.depreciation)} />
            <Row label="+ Appreciation" monthly={usd(p.appreciation / 12)} annual={usd(p.appreciation)} />

            <div className="mt-2 flex items-baseline gap-3 bg-neutral-950 px-3 py-2">
              <div className="flex-1 text-[13px] font-bold text-white">Gross equity income</div>
              <div className="w-24 text-right text-[13px] font-bold tabular-nums" style={{ color: GREEN }}>{usd(p.grossEquityIncome / 12)}</div>
              <div className="w-28 text-right text-[13px] font-bold tabular-nums" style={{ color: GREEN }}>{usd(p.grossEquityIncome)}</div>
            </div>
            <div className="mt-1 text-right text-[11px] text-neutral-500">
              Return on investment with IIDD: <span className="font-bold text-neutral-900">{pct(p.roiIidd)}</span>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em]">Capital required</h2>
              <dl className="space-y-1 text-[13px]">
                {[
                  ["Down payment", usd(p.down)],
                  ["Loan amount", usd(p.loan)],
                  ["Origination", usd(p.origination)],
                  ["Closing costs", usd(p.closingCosts)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-neutral-200 py-1">
                    <dt className="text-neutral-600">{k}</dt>
                    <dd className="tabular-nums">{v}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-b-2 border-neutral-900 py-1 font-bold">
                  <dt>Total cash to close</dt>
                  <dd className="tabular-nums">{usd(p.cashIn)}</dd>
                </div>
              </dl>
              <div className="mt-2 text-[11px] text-neutral-500">
                {sqft > 0 && `${usd(p.costPerSqft)} per sq ft · `}{usd(p.costPerBed)} per bedroom
              </div>
            </div>

            {market && (
              <div className="bg-neutral-950 p-4">
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-white">
                  PadSplit market — {deal.zip}
                </h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {[
                    ["Active units", market.active_units],
                    ["Upcoming units", market.upcoming_units],
                    ["Shared room", `${usd(market.shared_weekly)}/wk`],
                    ["Private bath", `${usd(market.private_weekly)}/wk`],
                    ["Avg occupancy", pct(market.avg_occupancy, 0)],
                    ["To first booking", `${market.days_to_first_booking} days`],
                    ["To 80% booked", `${market.days_to_80_percent} days`],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[10px] uppercase tracking-wider text-neutral-500">{k}</dt>
                      <dd className="text-sm font-bold text-white">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {p.compStats && (
              <div>
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em]">Resale comps — {deal.city}</h2>
                <div className="flex h-16 items-end gap-1">
                  {[["Low", p.compStats.low], ["Avg", p.compStats.avg], ["Median", p.compStats.median], ["High", p.compStats.high], ["This", p.price]].map(([label, val], i) => {
                    const isThis = i === 4;
                    const max = Math.max(p.compStats.high, p.price);
                    return (
                      <div key={label} className="flex-1 text-center">
                        <div className="mx-auto w-full rounded-t" style={{ height: `${(val / max) * 52}px`, backgroundColor: isThis ? GREEN : "#1F2937" }} />
                        <div className={`mt-1 text-[9px] uppercase tracking-wider ${isThis ? "font-bold" : "text-neutral-500"}`} style={isThis ? { color: GREEN } : {}}>{label}</div>
                        <div className="text-[10px] font-semibold tabular-nums text-neutral-800">{usd(val / 1000)}k</div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] leading-snug text-neutral-500">
                  {p.compStats.count} closed sales{p.compStats.avgPsf ? `, avg ${usd(p.compStats.avgPsf, 2)}/sq ft sold` : ""}.
                  {p.impliedResale && ` Implied resale at comp pricing: ${usd(p.impliedResale)}.`}
                </p>
              </div>
            )}

            <div>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em]">Property record</h2>
              <dl className="space-y-1 text-[12px]">
                {[
                  ["Parcel", deal.parcel_number],
                  ["Subdivision", deal.subdivision],
                  ["Year built", deal.year_built],
                  ["Lot", deal.lot_acres && deal.lot_sqft ? `${deal.lot_acres} ac / ${deal.lot_sqft.toLocaleString()} sq ft` : null],
                  ["Living area", deal.living_area_sqft ? `${deal.living_area_sqft.toLocaleString()}${deal.added_sqft ? ` + ${deal.added_sqft} added` : ""}` : null],
                  ["Construction", deal.construction_type],
                  ["Zoning", deal.zoning],
                  ["Schools", deal.school_district],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-neutral-100 py-0.5">
                    <dt className="text-neutral-500">{k}</dt>
                    <dd className="text-right text-neutral-800">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>

        <div className="border-t border-neutral-200 px-6 py-4 text-[10px] leading-relaxed text-neutral-500 sm:px-8">
          Projections are estimates based on PadSplit market data for ZIP {deal.zip} and Green Light
          Buying Machine underwriting assumptions. Actual results vary. Not an offer to sell a
          security. Buyers should conduct independent due diligence.
        </div>
      </div>
    </div>
  );
}
