"use client";

import { useState, useMemo } from "react";
import {
  computeProForma,
  snapshotOutputs,
  resolveAssumptions,
  estimateTaxes,
  rateForDown,
  usd,
  pct,
} from "../lib/proforma";
import { createSnapshot, updateDeal } from "../lib/queries";
import { BrandMark } from "./Brand";

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

function Row({ label, monthly, annual, share, tone = "normal", note }) {
  const styles = { normal: "text-neutral-800", minus: "text-neutral-600", total: "font-bold text-neutral-900" };
  return (
    // A grid, not a flex row. With flex + items-baseline, a label that
    // wrapped to two lines dropped its figures to the second baseline,
    // so the number columns wandered up and down the page. Fixed
    // tracks and top alignment keep every figure on its own line.
    <div
      className={`print-keep grid grid-cols-[1fr_5.5rem_6.5rem_3.5rem] items-start gap-x-3 py-1.5 ${
        tone === "total" ? "border-b-2 border-neutral-900" : "border-b border-neutral-200"
      }`}
    >
      <div className={`text-[13px] leading-5 ${styles[tone]}`}>
        {label}
        {note && <span className="ml-1.5 text-[11px] text-neutral-400">{note}</span>}
      </div>
      <div className={`text-right text-[13px] leading-5 tabular-nums ${styles[tone]}`}>
        {monthly}
      </div>
      <div className={`text-right text-[13px] leading-5 tabular-nums ${styles[tone]}`}>
        {annual}
      </div>
      <div
        className={`text-right text-[12px] leading-5 tabular-nums ${
          tone === "total" ? "font-bold text-neutral-900" : "text-neutral-400"
        }`}
      >
        {share}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, good }) {
  return (
    <div className="print-keep border-l-2 pl-3" style={{ borderColor: good === false ? "#B91C1C" : GREEN }}>
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

  // Whether the rate was typed rather than seeded. The field always
  // holds a number, so without this the seeded value looks like an
  // override and priced all three down-payment tiers at the same rate.
  const [rateEdited, setRateEdited] = useState(
    deal.assumptions?.rate != null
  );

  const [savingOv, setSavingOv] = useState(false);
  const [ovMsg, setOvMsg] = useState(null);

  // Anything saved on the deal wins over the org default, so an edited
  // assumption survives a reload instead of resetting every visit.
  const [ov, setOv] = useState({
    ...{
    price: Number(deal.list_price ?? deal.purchase_price ?? 0),
    ltv: A.ltv,
    rate: rateForDown(1 - A.ltv, A.interest_rate),
    term: A.loan_term_years,
    points: A.origination_points,
    closingPct: A.closing_costs_pct,
    sharedRate: market?.shared_weekly ?? 0,
    ensuiteRate: market?.private_weekly ?? 0,
    padsplitFee: A.padsplit_fee,
    mgmtFee: A.management_fee,
    maintFee: A.maintenance_rate,
    opexPerRoom: A.opex_per_room,
    tiRate: A.tax_insurance_rate,
    appreciation: A.appreciation_rate,
    },
    ...(deal.assumptions || {}),
  });

  const [savedOv, setSavedOv] = useState(deal.assumptions || null);
  const ovDirty = JSON.stringify(ov) !== JSON.stringify(savedOv);

  async function saveAssumptions() {
    setSavingOv(true);
    setOvMsg(null);
    try {
      await updateDeal(deal.id, { assumptions: ov });
      setSavedOv(ov);
      setOvMsg({ ok: true, text: "Assumptions saved to this deal." });
    } catch (e) {
      setOvMsg({ ok: false, text: e.message });
    } finally {
      setSavingOv(false);
    }
  }

  async function resetAssumptions() {
    setSavingOv(true);
    setOvMsg(null);
    try {
      await updateDeal(deal.id, { assumptions: {} });
      setSavedOv(null);
      setOvMsg({ ok: true, text: "Back to the org defaults. Reload to see them." });
    } catch (e) {
      setOvMsg({ ok: false, text: e.message });
    } finally {
      setSavingOv(false);
    }
  }

  const set = (k) => (v) => setOv((p) => ({ ...p, [k]: v }));
  const setPctField = (k) => (v) => setOv((p) => ({ ...p, [k]: v / 100 }));

  // An untouched rate is withheld, so each tier prices off the table.
  const effectiveOv = useMemo(
    () => (rateEdited ? ov : { ...ov, rate: undefined }),
    [ov, rateEdited]
  );

  const p = useMemo(
    () =>
      computeProForma({
        deal,
        rooms,
        market,
        comps,
        orgRows,
        scenario,
        overrides: effectiveOv,
      }),
    [deal, rooms, market, comps, orgRows, scenario, effectiveOv]
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

  // Every line as a share of gross scheduled rent. One denominator all
  // the way down, so the column adds up and the reader never has to ask
  // "percent of what".
  const shareOfGross = (n) => (p.grossMonthly > 0 ? pct(n / p.grossMonthly) : "—");

  const fmtDate = (d) =>
    new Date(`${d}T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });

  const asOfDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="bg-neutral-100 p-4 font-sans sm:p-8">
      <div className="print-doc mx-auto max-w-4xl bg-white shadow-xl">
        <div className="print-section bg-neutral-950 px-6 py-5 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <BrandMark height={30} />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GREEN }}>
                  Green Light Buying Machine
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-bold leading-none text-white sm:text-3xl">{deal.address_line}</h1>
              <div className="mt-1 text-sm text-neutral-400">
                {deal.city}, {deal.state} {deal.zip} · {p.mix.bedrooms} bed / {p.mix.bathrooms} bath
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

        <div className="print-section grid grid-cols-2 gap-4 border-b border-neutral-200 px-6 py-5 sm:grid-cols-4 sm:px-8">
          <Stat label="Monthly cash flow" value={usd(p.cashFlow)} sub={`${usd(p.cashFlow * 12)} / yr`} good={p.cashFlow > 0} />
          <Stat label="Cash on cash" value={pct(p.coc)} sub={`on ${usd(p.cashIn)} in`} good={p.coc > 0} />
          <Stat label="Cap rate" value={pct(p.capRate)} sub={`${pct(p.grossYield)} gross yield`} />
          <Stat label="DSCR" value={p.dscr.toFixed(2)} sub={p.dscr >= 1.2 ? "lender-ready" : "below 1.20"} good={p.dscr >= 1.2} />
        </div>

        <div className="border-b border-neutral-200 bg-neutral-50 px-6 py-2 text-[11px] leading-snug text-neutral-600 sm:px-8">
          <span className="font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Assumptions:{" "}
          </span>
          Income is modeled at {pct(1 - A.vacancy_rate, 0)} occupancy — the average
          across Green Light Buying Machine's established PadSplit properties once
          they have had time to stabilise. A house in lease-up runs below this
          until it fills.
          <br />
          Lender rates are current as of {asOfDate} — {pct(rateForDown(0.15))} at
          15% down, {pct(rateForDown(0.2))} at 20%, {pct(rateForDown(0.25))} at 25%.
          Rates, taxes, insurance and market rents move; these figures are a
          projection, not a quote.
        </div>

        <div className="print-only border-b border-neutral-200 px-6 py-2 text-[11px] text-neutral-600 sm:px-8">
          <span className="font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Occupancy basis:{" "}
          </span>
          {scenario === "glbm"
            ? `Green Light Buying Machine underwriting — ${pct(1 - A.vacancy_rate, 0)} occupancy`
            : `${deal.zip} actual — ${pct(1 - p.marketVacancy, 0)} occupancy`}
        </div>

        <div className="no-print print-section flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-6 py-3 sm:px-8">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Occupancy basis</span>
          {[
            { id: "glbm", label: `GLBM underwriting — ${pct(1 - A.vacancy_rate, 0)} occupancy` },
            { id: "market", label: `${deal.zip} actual — ${pct(1 - p.marketVacancy, 0)} occupancy` },
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
          <div className="no-print border-b border-neutral-200 bg-neutral-50 px-6 py-2 text-[11px] sm:px-8">
            <span className="text-neutral-500">Buyer link: </span>
            <code className="text-neutral-800">{shareUrl}</code>
          </div>
        )}

        {showInputs && (
          <div className="no-print grid grid-cols-2 gap-3 bg-neutral-950 px-6 py-5 sm:grid-cols-4 sm:px-8">
            <Field label="Price" prefix="$" step={5000} value={ov.price} onChange={set("price")} />
            <Field
              label="LTV"
              suffix="%"
              value={ov.ltv * 100}
              onChange={(v) => {
                const ltv = v / 100;
                setOv((prev) => ({
                  ...prev,
                  ltv,
                  // Keep the shown rate honest when it hasn't been typed over.
                  rate: rateEdited ? prev.rate : rateForDown(1 - ltv, A.interest_rate),
                }));
              }}
            />
            <Field
              label="Rate"
              suffix="%"
              step={0.125}
              value={ov.rate * 100}
              onChange={(v) => {
                setRateEdited(true);
                setPctField("rate")(v);
              }}
              hint={
                rateEdited
                  ? `overridden — ${Math.round((1 - ov.ltv) * 100)}% down normally prices at ${pct(rateForDown(1 - ov.ltv))}`
                  : `follows the down payment — ${Math.round((1 - ov.ltv) * 100)}% down prices at ${pct(rateForDown(1 - ov.ltv))}`
              }
            />
            <Field label="Term" suffix="yr" value={ov.term} onChange={set("term")} />
            <Field label="Points" suffix="%" step={0.25} value={ov.points * 100} onChange={setPctField("points")} />
            <Field label="Closing costs" suffix="%" step={0.25} value={ov.closingPct * 100} onChange={setPctField("closingPct")} />
            <Field label="Shared rate" prefix="$" suffix="/wk" value={ov.sharedRate} onChange={set("sharedRate")} />
            <Field label="Ensuite rate" prefix="$" suffix="/wk" value={ov.ensuiteRate} onChange={set("ensuiteRate")} />
            <Field label="PadSplit fee" suffix="%" value={ov.padsplitFee * 100} onChange={setPctField("padsplitFee")} />
            <Field label="Management" suffix="%" value={ov.mgmtFee * 100} onChange={setPctField("mgmtFee")} />
            <Field label="Maintenance" suffix="%" value={ov.maintFee * 100} onChange={setPctField("maintFee")} />
            <Field
              label="WiFi, cleaners, W/S/T, utilities"
              prefix="$"
              suffix="/room/mo"
              value={ov.opexPerRoom}
              onChange={set("opexPerRoom")}
            />
            <Field
              label="Taxes & insurance"
              suffix="%"
              step={0.01}
              value={ov.tiRate * 100}
              onChange={setPctField("tiRate")}
              hint={deal.assessed_tax_amount ? `Last tax bill ${usd(deal.assessed_tax_amount)}` : null}
            />
            <Field label="Appreciation" suffix="%" value={ov.appreciation * 100} onChange={setPctField("appreciation")} />

            <div className="col-span-2 flex flex-wrap items-center gap-3 border-t border-neutral-800 pt-4 sm:col-span-4">
              <button
                onClick={saveAssumptions}
                disabled={savingOv || !ovDirty}
                className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-40"
                style={{ backgroundColor: GREEN }}
              >
                {savingOv ? "Saving…" : ovDirty ? "Save assumptions" : "Saved ✓"}
              </button>

              <button
                onClick={resetAssumptions}
                disabled={savingOv || !savedOv}
                className="rounded px-3 py-2 text-[11px] font-semibold text-neutral-400 hover:text-white disabled:opacity-30"
              >
                Reset to org defaults
              </button>

              <span className={`text-[11px] ${ovMsg?.ok === false ? "text-red-400" : "text-neutral-400"}`}>
                {ovMsg
                  ? ovMsg.text
                  : ovDirty
                  ? "Unsaved — these numbers reset when you reload."
                  : savedOv
                  ? "Saved on this deal, overriding the org defaults."
                  : "Using the org defaults."}
              </span>
            </div>
          </div>
        )}

        <div className="print-single grid gap-8 px-6 py-6 sm:px-8 md:grid-cols-2">
          <div>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em]">Room revenue stack</h2>
            <div className="print-section mb-5 space-y-1.5">
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
            <div className="mb-1 grid grid-cols-[1fr_5.5rem_6.5rem_3.5rem] gap-x-3 border-b border-neutral-900 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              <div />
              <div className="text-right">Monthly</div>
              <div className="text-right">Annual</div>
              <div className="text-right">% of GSR</div>
            </div>
            <Row label="Gross scheduled rent" monthly={ma(p.grossMonthly)[0]} annual={ma(p.grossMonthly)[1]} share={shareOfGross(p.grossMonthly)} />
            <Row
              label={`Vacancy at ${pct(1 - p.vacancy, 0)} occupancy`}
              note={
                scenario === "glbm"
                  ? "stabilised portfolio average"
                  : `${deal.zip} market actual`
              }
              tone="minus"
              monthly={`(${usd(p.vacancyLoss)})`}
              annual={`(${usd(p.vacancyLoss * 12)})`}
              share={shareOfGross(-p.vacancyLoss)}
            />
            <Row label="Operating income" tone="total" monthly={ma(p.collected)[0]} annual={ma(p.collected)[1]} share={shareOfGross(p.collected)} />

            <h2 className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-[0.15em]">Operating expenses</h2>
            <Row label="PadSplit fee" note={`${pct(p.padsplitFeeRate)} of collected`} tone="minus" monthly={`(${usd(p.feePadsplit)})`} annual={`(${usd(p.feePadsplit * 12)})`} share={shareOfGross(-p.feePadsplit)} />
            <Row label="Property management" note={`${pct(p.mgmtFeeRate)} of collected`} tone="minus" monthly={`(${usd(p.feeMgmt)})`} annual={`(${usd(p.feeMgmt * 12)})`} share={shareOfGross(-p.feeMgmt)} />
            <Row
              label="Maintenance / R&M"
              note={`${pct(p.maintRate)} of collected`}
              tone="minus"
              monthly={`(${usd(p.feeMaint)})`}
              annual={`(${usd(p.feeMaint * 12)})`}
              share={shareOfGross(-p.feeMaint)}
            />
            <Row
              label="WiFi, cleaners, W/S/T, utilities"
              note={`${usd(p.opexPerRoom)}/room × ${p.mix.bedrooms}`}
              tone="minus"
              monthly={`(${usd(p.utilities)})`}
              annual={`(${usd(p.utilities * 12)})`}
              share={shareOfGross(-p.utilities)}
            />
            <Row
              label="Taxes & insurance"
              note={`${pct(p.tiRate, 3)} of ${usd(p.price)}`}
              tone="minus"
              monthly={`(${usd(p.fixed)})`}
              annual={`(${usd(p.fixed * 12)})`}
              share={shareOfGross(-p.fixed)}
            />
            <Row label="Total operating expenses" tone="total" monthly={`(${usd(p.opex)})`} annual={`(${usd(p.opex * 12)})`} share={shareOfGross(-p.opex)} />

            <div className="print-break-before print-section">
              <div className="print-continued mb-3 border-b border-neutral-200 pb-2 text-[9px] uppercase tracking-[0.14em] text-neutral-400">
                {deal.address_line} — continued
              </div>
            <h2 className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-[0.15em]">Net performance</h2>
            <Row label="Net operating income" monthly={ma(p.noi)[0]} annual={ma(p.noi)[1]} share={shareOfGross(p.noi)} />
            <Row label="Debt service" note={`${(p.rate * 100).toFixed(3)}% / ${p.term} yr`} tone="minus" monthly={`(${usd(p.payment)})`} annual={`(${usd(p.payment * 12)})`} share={shareOfGross(-p.payment)} />
            <Row label="Cash flow" tone="total" monthly={ma(p.cashFlow)[0]} annual={ma(p.cashFlow)[1]} share={shareOfGross(p.cashFlow)} />
            <Row
              label="+ Principal reduction"
              note={`${pct(p.rate, 3)} / ${p.term} yr`}
              monthly={usd(p.year1Principal / 12)}
              annual={usd(p.year1Principal)}
              share={shareOfGross(p.year1Principal / 12)}
            />
            <Row
              label="+ Depreciation"
              note={`${p.term ? "" : ""}${(100 / 27.5).toFixed(1)}% of building basis`}
              monthly={usd(p.depreciation / 12)}
              annual={usd(p.depreciation)}
              share={shareOfGross(p.depreciation / 12)}
            />
            <Row
              label="+ Appreciation"
              note={`@ ${pct(p.appreciationRate)} of ${usd(p.price)}`}
              monthly={usd(p.appreciation / 12)}
              annual={usd(p.appreciation)}
              share={shareOfGross(p.appreciation / 12)}
            />

            <div className="mt-2 flex items-baseline gap-3 bg-neutral-950 px-3 py-2">
              <div className="flex-1 text-[13px] font-bold text-white">Gross equity income</div>
              <div className="w-24 text-right text-[13px] font-bold tabular-nums" style={{ color: GREEN }}>{usd(p.grossEquityIncome / 12)}</div>
              <div className="w-28 text-right text-[13px] font-bold tabular-nums" style={{ color: GREEN }}>{usd(p.grossEquityIncome)}</div>
            </div>
            <div className="mt-1 text-right text-[11px] text-neutral-500">
              Return on investment with IIDD: <span className="font-bold text-neutral-900">{pct(p.roiIidd)}</span>
            </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="print-break-before print-section">
              <div className="print-continued mb-3 border-b border-neutral-200 pb-2 text-[9px] uppercase tracking-[0.14em] text-neutral-400">
                {deal.address_line} — continued
              </div>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em]">Capital required</h2>
              <dl className="space-y-1 text-[13px]">
                {[
                  ["Down payment", usd(p.down), `${pct(1 - p.ltv, 0)} of price`],
                  ["Loan amount", usd(p.loan), `${pct(p.ltv, 0)} LTV at ${pct(p.rate, 3)}`],
                  ["Origination", usd(p.origination), `${pct(p.points)} of loan`],
                  ["Closing costs", usd(p.closingCosts), `${pct(p.closingPct, 0)} of price`],
                ].map(([k, v, note]) => (
                  <div key={k} className="flex items-baseline justify-between border-b border-neutral-200 py-1">
                    <dt className="text-neutral-600">
                      {k}
                      {note && (
                        <span className="ml-1.5 text-[11px] text-neutral-400">{note}</span>
                      )}
                    </dt>
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

            {/* The same deal at three down payments. Origination is a
                point charge on the loan, so it falls as the down
                payment rises. Closing costs don't move. */}
            <div className="print-section">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em]">
                Down payment options
              </h2>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b-2 border-neutral-900 text-left">
                    <th className="py-1 font-semibold text-neutral-600"> </th>
                    {p.financingOptions.map((o) => (
                      <th key={o.downPct} className="py-1 text-right font-bold">
                        {o.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Down payment", (o) => usd(o.down)],
                    ["Loan amount", (o) => usd(o.loan)],
                    ["Rate", (o) => pct(o.rate, 3)],
                    [
                      `Origination (${pct(p.points)})`,
                      (o) => usd(o.origination),
                    ],
                    [`Closing costs (${pct(p.closingPct, 0)})`, (o) => usd(o.closingCosts)],
                  ].map(([label, fn]) => (
                    <tr key={label} className="border-b border-neutral-200">
                      <td className="py-1 text-neutral-600">{label}</td>
                      {p.financingOptions.map((o) => (
                        <td key={o.downPct} className="py-1 text-right tabular-nums">
                          {fn(o)}
                        </td>
                      ))}
                    </tr>
                  ))}

                  <tr className="border-b-2 border-neutral-900 font-bold">
                    <td className="py-1">Total cash to close</td>
                    {p.financingOptions.map((o) => (
                      <td key={o.downPct} className="py-1 text-right tabular-nums">
                        {usd(o.cashIn)}
                      </td>
                    ))}
                  </tr>

                  <tr className="border-b border-neutral-200">
                    <td className="py-1 text-neutral-600">Debt service / mo</td>
                    {p.financingOptions.map((o) => (
                      <td key={o.downPct} className="py-1 text-right tabular-nums">
                        ({usd(o.payment)})
                      </td>
                    ))}
                  </tr>

                  <tr className="border-b border-neutral-200">
                    <td className="py-1 text-neutral-600">Cash flow / mo</td>
                    {p.financingOptions.map((o) => (
                      <td
                        key={o.downPct}
                        className="py-1 text-right font-semibold tabular-nums"
                        style={{ color: o.cashFlow >= 0 ? GREEN : "#b91c1c" }}
                      >
                        {usd(o.cashFlow)}
                      </td>
                    ))}
                  </tr>

                  <tr className="border-b border-neutral-200">
                    <td className="py-1 text-neutral-600">Cash on cash</td>
                    {p.financingOptions.map((o) => (
                      <td key={o.downPct} className="py-1 text-right tabular-nums">
                        {pct(o.cashOnCash)}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="py-1 text-neutral-600">DSCR</td>
                    {p.financingOptions.map((o) => (
                      <td key={o.downPct} className="py-1 text-right tabular-nums">
                        {o.dscr.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <div className="mt-2 text-[11px] leading-snug text-neutral-500">
                Same price and term throughout. Each tier prices at its own
                rate, so more equity buys both a smaller loan and a cheaper one.
                Origination is {pct(p.points)} of the loan; closing costs are{" "}
                {pct(p.closingPct, 0)} of price and don't move.
                <br />
                Rates are indicative, based on lender pricing as of{" "}
                {asOfDate}, and are not a quote or a commitment. A buyer's
                actual rate depends on credit, reserves and the product
                written.
              </div>
            </div>

            {market && (
              <div className="print-break-before print-section bg-neutral-950 p-4">
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
              <div className="print-section">
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
                  {p.compStats.count} closed sales
                  {p.compStats.newestSale
                    ? `, most recent ${fmtDate(p.compStats.newestSale)}${
                        p.compStats.oldestSale && p.compStats.oldestSale !== p.compStats.newestSale
                          ? ` (back to ${fmtDate(p.compStats.oldestSale)})`
                          : ""
                      }`
                    : ", no sale dates recorded"}
                  .
                  {p.compStats.monthsSinceNewest != null &&
                    p.compStats.monthsSinceNewest > 6 &&
                    ` The most recent sale is ${p.compStats.monthsSinceNewest} months old — the range may be stale.`}
                  {p.compStats.datedCount != null &&
                    p.compStats.datedCount < p.compStats.count &&
                    ` ${p.compStats.count - p.compStats.datedCount} without a date.`}
                  {p.impliedResale
                    ? ` Implied resale at comp pricing: ${usd(p.impliedResale)}.`
                    : ""}
                  {p.compStats.psfDiscarded > 0 &&
                    ` ${p.compStats.psfDiscarded} comp${
                      p.compStats.psfDiscarded > 1 ? "s" : ""
                    } excluded — price per sq ft outside a plausible range.`}
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

        <div className="print-section border-t border-neutral-200 px-6 py-4 text-[10px] leading-relaxed text-neutral-500 sm:px-8">
          Projections are estimates based on PadSplit market data for ZIP {deal.zip} and Green Light
          Buying Machine underwriting assumptions, priced as of {asOfDate}. Occupancy is modeled at{" "}
          {pct(1 - A.vacancy_rate, 0)}, the average across Green Light Buying Machine's established
          PadSplit properties after stabilisation; a property in lease-up performs below this until
          it fills. Interest rates,
          taxes, insurance and market rents change; figures shown are not a quote, a commitment
          to lend, or an offer to sell a security. Actual results vary. Buyers should conduct
          independent due diligence.
        </div>
      </div>
    </div>
  );
}
