"use client";

// ============================================================
// Assumptions and actuals.
//
// Collapsible groups with a column per scenario, so a house can be
// tuned in place instead of in the source. Rows that don't vary by
// scenario span the columns rather than repeating the same figure
// three times.
//
// Once a house is operating, the same fields take actuals: real
// occupancy off the PadSplit dashboard, the real SRP bill, what
// turnover actually cost. Nothing distinguishes an assumption from
// an actual except that someone typed the real number in.
// ============================================================

import { useState } from "react";
import { usd } from "../lib/proformaClub";

const GREEN = "#00A651";
const KEYS = ["base", "bull", "bear"];

function Field({ value, onChange, kind = "money", width = "w-full" }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? String(kind === "pct" ? +(value * 100).toFixed(2) : value);

  const commit = () => {
    const n = parseFloat(draft);
    if (draft !== null && Number.isFinite(n)) onChange(kind === "pct" ? n / 100 : n);
    setDraft(null);
  };

  return (
    <div className="flex items-center justify-end gap-0.5">
      {kind === "money" && <span className="text-[11px] text-neutral-400">$</span>}
      <input
        type="text"
        inputMode="decimal"
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        className={`${width} rounded-sm border-b border-dashed border-neutral-400 bg-transparent px-1 py-0.5 text-right text-[12px] tabular-nums text-neutral-900 outline-none transition focus:border-solid focus:bg-white`}
        style={{ borderBottomColor: draft !== null ? GREEN : undefined }}
      />
      {kind === "pct" && <span className="text-[11px] text-neutral-400">%</span>}
    </div>
  );
}

function Group({ title, children, defaultOpen = false, note }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-2 rounded border border-neutral-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span
          className="text-[11px] text-neutral-400 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          ▸
        </span>
        <span className="text-[12px] font-semibold text-neutral-800">{title}</span>
        {note && <span className="text-[10px] text-neutral-400">{note}</span>}
      </button>
      {open && <div className="border-t border-neutral-100 px-3 pb-3 pt-2">{children}</div>}
    </div>
  );
}

// A row with one editable cell per scenario.
function ScenarioRow({ label, model, path, kind, onChange, hint }) {
  return (
    <div className="grid grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-2 border-b border-neutral-100 py-1.5">
      <div className="text-[12px] text-neutral-700">
        {label}
        {hint && <span className="ml-1.5 text-[10px] text-neutral-400">{hint}</span>}
      </div>
      {KEYS.map((k) => (
        <Field
          key={k}
          kind={kind}
          value={path(model.scenarios[k])}
          onChange={(v) => onChange(k, v)}
        />
      ))}
    </div>
  );
}

// A row that applies across all three scenarios.
function SharedRow({ label, value, kind, onChange, hint }) {
  return (
    <div className="grid grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-2 border-b border-neutral-100 py-1.5">
      <div className="text-[12px] text-neutral-700">
        {label}
        {hint && <span className="ml-1.5 text-[10px] text-neutral-400">{hint}</span>}
      </div>
      <div className="col-span-3">
        <Field kind={kind} value={value} onChange={onChange} width="w-24" />
      </div>
    </div>
  );
}

export default function ClubAssumptions({ model, setModel, onReset, perBedOpex }) {
  // Every setter rebuilds the object rather than mutating it, so the
  // memos downstream see a new reference and recompute.
  const setScenario = (key, mutate) =>
    setModel((m) => ({
      ...m,
      scenarios: { ...m.scenarios, [key]: mutate(m.scenarios[key]) },
    }));

  const setIncome = (key, field, v) =>
    setScenario(key, (sc) => ({ ...sc, income: { ...sc.income, [field]: v } }));

  const setPlatform = (key, field, v) =>
    setScenario(key, (sc) => ({
      ...sc,
      income: { ...sc.income, platform: { ...sc.income.platform, [field]: v } },
    }));

  const setExpenseGrowth = (key, v) =>
    setScenario(key, (sc) => ({ ...sc, expenses: { ...sc.expenses, growthPct: v } }));

  const setAppreciation = (key, v) =>
    setScenario(key, (sc) => ({ ...sc, exit: { ...sc.exit, appreciationPct: v } }));

  // Dollar expense lines are a property of the house, not of the
  // scenario, so they write to all three at once.
  const setExpenseAll = (field, v) =>
    setModel((m) => ({
      ...m,
      scenarios: KEYS.reduce(
        (acc, k) => ({
          ...acc,
          [k]: { ...m.scenarios[k], expenses: { ...m.scenarios[k].expenses, [field]: v } },
        }),
        {}
      ),
    }));

  const setRateByType = (ensuite, v) =>
    setModel((m) => ({
      ...m,
      scenarios: KEYS.reduce(
        (acc, k) => ({
          ...acc,
          [k]: {
            ...m.scenarios[k],
            income: {
              ...m.scenarios[k].income,
              rooms: m.scenarios[k].income.rooms.map((r) =>
                r.isEnsuite === ensuite ? { ...r, weeklyRate: v } : r
              ),
            },
          },
        }),
        {}
      ),
    }));

  const setCap = (field, v) =>
    setModel((m) => ({ ...m, capitalization: { ...m.capitalization, [field]: v } }));

  const setDebt = (field, v) =>
    setModel((m) => ({ ...m, debt: { ...m.debt, [field]: v } }));

  const setRefi = (field, v) =>
    setModel((m) => ({ ...m, refinance: { ...m.refinance, [field]: v } }));

  const setExit = (field, v) =>
    setModel((m) => ({ ...m, exit: { ...m.exit, [field]: v } }));

  const rooms = model.scenarios.base.income.rooms;
  const shared = rooms.find((r) => !r.isEnsuite);
  const ensuite = rooms.find((r) => r.isEnsuite);
  const e = model.scenarios.base.expenses;

  return (
    <div className="no-print border-b border-neutral-200 bg-neutral-50 px-6 py-4 sm:px-8">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-neutral-900">
            Assumptions &amp; actuals
          </h2>
          <p className="text-[11px] text-neutral-500">
            Dashed fields are editable. Once the house is operating, replace
            them with what actually happened.
          </p>
        </div>
        <button
          onClick={onReset}
          className="rounded px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500 ring-1 ring-neutral-300 transition hover:text-neutral-900"
        >
          Reset
        </button>
      </div>

      <div className="mb-1.5 grid grid-cols-[1fr_repeat(3,4.5rem)] gap-2">
        <div />
        {["Base", "Bull", "Bear"].map((h) => (
          <div
            key={h}
            className="text-right text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-500"
          >
            {h}
          </div>
        ))}
      </div>

      <Group title="Rental income" defaultOpen note="per week, per room">
        {ensuite && (
          <SharedRow
            label="Ensuite weekly rate"
            value={ensuite.weeklyRate}
            kind="money"
            onChange={(v) => setRateByType(true, v)}
            hint={`${rooms.filter((r) => r.isEnsuite).length} room(s)`}
          />
        )}
        {shared && (
          <SharedRow
            label="Shared-bath weekly rate"
            value={shared.weeklyRate}
            kind="money"
            onChange={(v) => setRateByType(false, v)}
            hint={`${rooms.filter((r) => !r.isEnsuite).length} room(s)`}
          />
        )}
        <ScenarioRow
          label="Occupancy"
          model={model}
          path={(sc) => sc.income.occupancyPct}
          kind="pct"
          onChange={(k, v) => setIncome(k, "occupancyPct", v)}
        />
        <ScenarioRow
          label="Collections rate"
          model={model}
          path={(sc) => sc.income.collectionsPct}
          kind="pct"
          onChange={(k, v) => setIncome(k, "collectionsPct", v)}
        />
        <ScenarioRow
          label="Turnovers per room / yr"
          model={model}
          path={(sc) => sc.income.platform.turnsPerRoomPerYear}
          kind="num"
          onChange={(k, v) => setPlatform(k, "turnsPerRoomPerYear", v)}
          hint="drives booking fees"
        />
        <ScenarioRow
          label="Rent growth / yr"
          model={model}
          path={(sc) => sc.income.growthPct}
          kind="pct"
          onChange={(k, v) => setIncome(k, "growthPct", v)}
        />
        <SharedRow
          label="Platform service fee"
          value={model.scenarios.base.income.platform.serviceFeePct}
          kind="pct"
          onChange={(v) => KEYS.forEach((k) => setPlatform(k, "serviceFeePct", v))}
          hint="PadSplit 8%"
        />
        <SharedRow
          label="Booking fee days"
          value={model.scenarios.base.income.platform.bookingFeeDays}
          kind="num"
          onChange={(v) => KEYS.forEach((k) => setPlatform(k, "bookingFeeDays", v))}
          hint="per move-in"
        />
      </Group>

      <Group title="Operating expenses" note={`${usd(perBedOpex)} / bed / yr`}>
        <SharedRow
          label="Property taxes / yr"
          value={e.propertyTaxesAnnual}
          kind="money"
          onChange={(v) => setExpenseAll("propertyTaxesAnnual", v)}
        />
        <SharedRow
          label="Insurance / yr"
          value={e.insuranceAnnual}
          kind="money"
          onChange={(v) => setExpenseAll("insuranceAnnual", v)}
        />
        <SharedRow
          label="HOA / yr"
          value={e.hoaAnnual}
          kind="money"
          onChange={(v) => setExpenseAll("hoaAnnual", v)}
        />
        <SharedRow
          label="Utilities / yr"
          value={e.utilitiesAnnual}
          kind="money"
          onChange={(v) => setExpenseAll("utilitiesAnnual", v)}
          hint="landlord-paid"
        />
        <SharedRow
          label="Repairs & maintenance / yr"
          value={e.repairsMaintenanceAnnual}
          kind="money"
          onChange={(v) => setExpenseAll("repairsMaintenanceAnnual", v)}
        />
        <SharedRow
          label="Turnover / make-ready / yr"
          value={e.turnoverAnnual}
          kind="money"
          onChange={(v) => setExpenseAll("turnoverAnnual", v)}
        />
        <SharedRow
          label="Common-area cleaning / yr"
          value={e.commonAreaCleaningAnnual}
          kind="money"
          onChange={(v) => setExpenseAll("commonAreaCleaningAnnual", v)}
        />
        <SharedRow
          label="Landscaping & pest / yr"
          value={e.landscapingPestAnnual}
          kind="money"
          onChange={(v) => setExpenseAll("landscapingPestAnnual", v)}
        />
        <SharedRow
          label="Supplies / yr"
          value={e.suppliesAnnual}
          kind="money"
          onChange={(v) => setExpenseAll("suppliesAnnual", v)}
        />
        <SharedRow
          label="Management"
          value={e.managementPctOfNet}
          kind="pct"
          onChange={(v) => setExpenseAll("managementPctOfNet", v)}
          hint="% of net to owner · 0 if self-managed"
        />
        <SharedRow
          label="Capital reserve"
          value={e.capexReservePctOfNet}
          kind="pct"
          onChange={(v) => setExpenseAll("capexReservePctOfNet", v)}
          hint="% of net to owner"
        />
        <ScenarioRow
          label="Expense growth / yr"
          model={model}
          path={(sc) => sc.expenses.growthPct}
          kind="pct"
          onChange={(k, v) => setExpenseGrowth(k, v)}
        />
      </Group>

      <Group title="Purchase & financing">
        <SharedRow
          label="Purchase price"
          value={model.capitalization.purchasePrice}
          kind="money"
          onChange={(v) => setCap("purchasePrice", v)}
        />
        <SharedRow
          label="Loan-to-value"
          value={model.capitalization.ltv}
          kind="pct"
          onChange={(v) => setCap("ltv", v)}
        />
        <SharedRow
          label="Interest rate"
          value={model.debt.interestRatePct / 100}
          kind="pct"
          onChange={(v) => setDebt("interestRatePct", v * 100)}
        />
        <SharedRow
          label="Closing costs"
          value={model.capitalization.closingCostPct}
          kind="pct"
          onChange={(v) => setCap("closingCostPct", v)}
          hint="% of price"
        />
        <SharedRow
          label="Loan costs"
          value={model.capitalization.loanCostPct}
          kind="pct"
          onChange={(v) => setCap("loanCostPct", v)}
          hint="% of loan"
        />
        <SharedRow
          label="Vacancy reserve"
          value={model.capitalization.vacancyReservePct}
          kind="pct"
          onChange={(v) => setCap("vacancyReservePct", v)}
        />
        <SharedRow
          label="Maintenance reserve"
          value={model.capitalization.maintenanceReservePct}
          kind="pct"
          onChange={(v) => setCap("maintenanceReservePct", v)}
        />
        <SharedRow
          label="Sponsor / platform fee"
          value={model.capitalization.platformFeePct}
          kind="pct"
          onChange={(v) => setCap("platformFeePct", v)}
          hint="0 for a direct purchase"
        />
        <SharedRow
          label="Conversion capex"
          value={model.capitalization.conversionCapex}
          kind="money"
          onChange={(v) => setCap("conversionCapex", v)}
        />
        <SharedRow
          label="Furnishing"
          value={model.capitalization.furnishingCost}
          kind="money"
          onChange={(v) => setCap("furnishingCost", v)}
        />

        <div className="mt-2 flex items-center gap-4 pt-1">
          <label className="flex items-center gap-1.5 text-[12px] text-neutral-700">
            <input
              type="checkbox"
              checked={model.debt.interestOnly}
              onChange={(ev) => setDebt("interestOnly", ev.target.checked)}
            />
            Interest only
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-neutral-700">
            <input
              type="checkbox"
              checked={model.capitalization.capitalizeReserves}
              onChange={(ev) => setCap("capitalizeReserves", ev.target.checked)}
            />
            Reserves funded at close
          </label>
        </div>
      </Group>

      <Group title="Refinance & exit">
        <div className="mb-2 flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-[12px] text-neutral-700">
            <input
              type="checkbox"
              checked={model.refinance.enabled}
              onChange={(ev) => setRefi("enabled", ev.target.checked)}
            />
            Refinance
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-neutral-700">
            <input
              type="checkbox"
              checked={model.refinance.interestOnly}
              onChange={(ev) => setRefi("interestOnly", ev.target.checked)}
            />
            New loan interest only
          </label>
        </div>
        <SharedRow
          label="Refinance in year"
          value={model.refinance.year}
          kind="num"
          onChange={(v) => setRefi("year", Math.round(v))}
          hint="skipped if on or after sale"
        />
        <SharedRow
          label="Refinance LTV"
          value={model.refinance.ltv}
          kind="pct"
          onChange={(v) => setRefi("ltv", v)}
        />
        <SharedRow
          label="Refinance rate"
          value={model.refinance.interestRatePct / 100}
          kind="pct"
          onChange={(v) => setRefi("interestRatePct", v * 100)}
        />
        <ScenarioRow
          label="Appreciation / yr"
          model={model}
          path={(sc) => sc.exit.appreciationPct}
          kind="pct"
          onChange={(k, v) => setAppreciation(k, v)}
        />
        <SharedRow
          label="Broker fee at sale"
          value={model.exit.brokerFeePct}
          kind="pct"
          onChange={(v) => setExit("brokerFeePct", v)}
        />
        <SharedRow
          label="Other closing at sale"
          value={model.exit.otherClosingPct}
          kind="pct"
          onChange={(v) => setExit("otherClosingPct", v)}
        />
      </Group>
    </div>
  );
}
