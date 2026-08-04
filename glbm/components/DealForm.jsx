"use client";

import { useState } from "react";
import { saveDeal, slugify, upsertMarket, saveComps } from "../lib/queries";

// ============================================================
// Deal intake — the form that starts every deal.
// Sections mirror the source documents so someone can key
// straight off the assessor printout, the MLS comps sheet,
// and the PadSplit market screen without hunting for fields.
// ============================================================

const GREEN = "#00A651";

const STATUSES = [
  "underwriting",
  "acquiring",
  "rehab",
  "launching",
  "for_sale",
  "sold",
];

function Input({ label, value, onChange, type = "text", prefix, suffix, hint, span }) {
  return (
    <label className={`block ${span ? `sm:col-span-${span}` : ""}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
        {label}
      </span>
      <div className="mt-1 flex items-center rounded border border-neutral-300 bg-white focus-within:border-neutral-900">
        {prefix && <span className="pl-2 text-sm text-neutral-400">{prefix}</span>}
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) =>
            onChange(
              type === "number"
                ? e.target.value === ""
                  ? null
                  : parseFloat(e.target.value)
                : e.target.value
            )
          }
          className="w-full bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        {suffix && <span className="pr-2 text-xs text-neutral-400">{suffix}</span>}
      </div>
      {hint && <span className="mt-0.5 block text-[10px] text-neutral-400">{hint}</span>}
    </label>
  );
}

function Section({ title, source, children }) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-baseline justify-between border-b-2 border-neutral-900 pb-1">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.12em]">{title}</h2>
        {source && (
          <span className="text-[10px] italic text-neutral-400">from {source}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
    </section>
  );
}

export default function DealForm({ initial = {}, initialMarket = null, onSaved }) {
  const [d, setD] = useState({
    status: "underwriting",
    visibility: "private",
    state: "AZ",
    added_sqft: 0,
    ensuite_count: 0,
    ...initial,
  });
  const [mk, setMk] = useState(initialMarket || { zip: initial.zip || "" });
  const [compsText, setCompsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const set = (k) => (v) => setD((prev) => ({ ...prev, [k]: v }));
  const setM = (k) => (v) => setMk((prev) => ({ ...prev, [k]: v }));

  // Paste MLS rows: address, status, sold price, sqft, $/sqft
  function parseComps(text) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\t|\s{2,}|,(?=\s*\S)/).map((s) => s.trim());
        const nums = line.match(/[\d,]+\.?\d*/g)?.map((n) => parseFloat(n.replace(/,/g, ""))) || [];
        const big = nums.filter((n) => n > 50000);
        const sqft = nums.find((n) => n > 400 && n < 20000);
        return {
          address: parts[0],
          comp_status: /pend/i.test(line)
            ? "pending"
            : /activ/i.test(line)
            ? "active"
            : "closed",
          sold_price: big[big.length - 1] || null,
          list_price: big[0] || null,
          approx_sqft: sqft || null,
          price_per_sqft:
            big[big.length - 1] && sqft ? +(big[big.length - 1] / sqft).toFixed(2) : null,
        };
      });
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        ...d,
        slug: d.slug || slugify(d.address_line || "", d.city || ""),
        post_reno_sqft:
          d.post_reno_sqft ??
          (d.living_area_sqft ? d.living_area_sqft + (d.added_sqft || 0) : null),
      };
      const deal = await saveDeal(payload);

      if (mk.zip && mk.active_units != null) {
        await upsertMarket({
          ...mk,
          avg_occupancy: mk.avg_occupancy > 1 ? mk.avg_occupancy / 100 : mk.avg_occupancy,
        });
      }
      if (compsText.trim()) {
        await saveComps(deal.id, parseComps(compsText));
      }

      setD(deal);
      setMsg({ ok: true, text: `Saved. Slug: ${deal.slug}` });
      onSaved?.(deal);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  }

  const impliedSqft =
    d.living_area_sqft != null ? d.living_area_sqft + (d.added_sqft || 0) : null;
  const sqftMismatch =
    impliedSqft != null && d.post_reno_sqft != null && impliedSqft !== d.post_reno_sqft;

  return (
    <div className="mx-auto max-w-4xl p-4 font-sans sm:p-8">
      <div className="mb-6 bg-neutral-950 px-5 py-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GREEN }}>
          Green Light Buying Machine
        </div>
        <h1 className="text-xl font-bold text-white">
          {d.id ? "Edit deal" : "New deal"}
        </h1>
      </div>

      <Section title="Location" source="assessor record">
        <Input label="Street address" value={d.address_line} onChange={set("address_line")} span={2} />
        <Input label="City" value={d.city} onChange={set("city")} />
        <Input label="ZIP" value={d.zip} onChange={(v) => { set("zip")(v); setM("zip")(v); }} />
        <Input label="Parcel number" value={d.parcel_number} onChange={set("parcel_number")} />
        <Input label="Subdivision" value={d.subdivision} onChange={set("subdivision")} span={2} />
        <Input label="School district" value={d.school_district} onChange={set("school_district")} />
      </Section>

      <Section title="Structure" source="assessor record">
        <Input label="Year built" type="number" value={d.year_built} onChange={set("year_built")} />
        <Input label="Lot sq ft" type="number" value={d.lot_sqft} onChange={set("lot_sqft")} />
        <Input label="Lot acres" type="number" value={d.lot_acres} onChange={set("lot_acres")} />
        <Input label="Zoning" value={d.zoning} onChange={set("zoning")} />
        <Input label="Living area" type="number" suffix="sq ft" value={d.living_area_sqft} onChange={set("living_area_sqft")} />
        <Input label="Added attached" type="number" suffix="sq ft" value={d.added_sqft} onChange={set("added_sqft")} />
        <Input
          label="Marketed sq ft"
          type="number"
          value={d.post_reno_sqft}
          onChange={set("post_reno_sqft")}
          hint={impliedSqft ? `Assessor implies ${impliedSqft.toLocaleString()}` : null}
        />
        <Input label="Construction" value={d.construction_type} onChange={set("construction_type")} />
      </Section>

      {sqftMismatch && (
        <div className="-mt-3 mb-6 rounded border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          Marketed square footage doesn't match assessor living area plus added space. Fine
          if part of the addition stays unconditioned — worth confirming before it reaches a
          buyer email.
        </div>
      )}

      <Section title="Configuration & pricing">
        <Input label="Bathrooms" type="number" value={d.bathrooms} onChange={set("bathrooms")} hint="Bedrooms come from the sketch" />
        <Input label="Purchase price" type="number" prefix="$" value={d.purchase_price} onChange={set("purchase_price")} />
        <Input label="Rehab budget" type="number" prefix="$" value={d.rehab_budget} onChange={set("rehab_budget")} />
        <Input label="Furniture budget" type="number" prefix="$" value={d.furniture_budget} onChange={set("furniture_budget")} />
        <Input label="Turnkey list price" type="number" prefix="$" value={d.list_price} onChange={set("list_price")} />
        <Input label="Acquisition COE" type="date" value={d.close_of_escrow} onChange={set("close_of_escrow")} />
        <Input label="Delivery to buyer" type="date" value={d.disposition_coe} onChange={set("disposition_coe")} hint="Date quoted in the email" />
        <Input label="Last tax bill" type="number" prefix="$" value={d.assessed_tax_amount} onChange={set("assessed_tax_amount")} hint="Reclassed automatically" />
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
            Status
          </span>
          <select
            value={d.status}
            onChange={(e) => set("status")(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title={`PadSplit market — ${mk.zip || "ZIP"}`} source="padsplit.com market insights">
        <Input label="Active units" type="number" value={mk.active_units} onChange={setM("active_units")} />
        <Input label="Upcoming units" type="number" value={mk.upcoming_units} onChange={setM("upcoming_units")} />
        <Input label="Shared room" type="number" prefix="$" suffix="/wk" value={mk.shared_weekly} onChange={setM("shared_weekly")} />
        <Input label="Private bath" type="number" prefix="$" suffix="/wk" value={mk.private_weekly} onChange={setM("private_weekly")} />
        <Input label="Avg occupancy" type="number" suffix="%" value={mk.avg_occupancy} onChange={setM("avg_occupancy")} hint="Enter 74 or 0.74" />
        <Input label="Days to 1st booking" type="number" value={mk.days_to_first_booking} onChange={setM("days_to_first_booking")} />
        <Input label="Days to 80% booked" type="number" value={mk.days_to_80_percent} onChange={setM("days_to_80_percent")} />
      </Section>

      <Section title="Comps" source="flexmls summary">
        <div className="col-span-2 sm:col-span-4">
          <textarea
            value={compsText}
            onChange={(e) => setCompsText(e.target.value)}
            rows={5}
            placeholder={"Paste MLS rows, one per line. Example:\n1644 W Friess Dr  $599,995  2,139  $282.84  $605,000"}
            className="w-full rounded border border-neutral-300 px-2 py-2 font-mono text-[11px] outline-none focus:border-neutral-900"
          />
          <p className="mt-1 text-[10px] text-neutral-400">
            Parsed on save. Review them on the deal page — the parser guesses status from
            the row text.
          </p>
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !d.address_line}
          className="rounded px-5 py-2 text-[12px] font-bold uppercase tracking-wider text-white disabled:opacity-40"
          style={{ backgroundColor: GREEN }}
        >
          {saving ? "Saving…" : "Save deal"}
        </button>
        {msg && (
          <span className={`text-[12px] ${msg.ok ? "text-neutral-600" : "text-red-700"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
