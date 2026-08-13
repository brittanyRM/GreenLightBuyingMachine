"use client";

import { useState } from "react";
import { saveDeal, slugify, upsertMarket, saveComps } from "../lib/queries";
import DocumentIntake from "./DocumentIntake";
import MediaUploader from "./MediaUploader";

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

  // Extraction fills the form; it never writes to the database.
  function applyExtraction({ deal, market, comps, conversion }) {
    setD((prev) => ({
      ...prev,
      ...deal,
      // The conversion the packet describes becomes the target, never
      // the bedroom count itself — that still comes from the sketch.
      ...(conversion?.bedrooms_after ? { target_bedrooms: conversion.bedrooms_after } : {}),
      ...(conversion?.bathrooms_after ? { target_bathrooms: conversion.bathrooms_after } : {}),
      ...(conversion?.ensuite_count ? { target_ensuites: conversion.ensuite_count } : {}),
      ...(conversion?.bathrooms_after && !deal.bathrooms ? { bathrooms: conversion.bathrooms_after } : {}),
    }));
    if (market?.zip) setMk((prev) => ({ ...prev, ...market }));
    if (comps?.length) {
      setCompsText(
        comps
          .map((c) =>
            [c.address, c.list_price, c.approx_sqft, c.price_per_sqft, c.sold_price]
              .filter(Boolean)
              .join("  ")
          )
          .join("\n")
      );
    }
    setMsg({ ok: true, text: "Form filled from the packet. Review, then save." });
  }

  const set = (k) => (v) => setD((prev) => ({ ...prev, [k]: v }));
  const setM = (k) => (v) => setMk((prev) => ({ ...prev, [k]: v }));

  // Paste MLS rows: address, list price, sqft, $/sqft, sold price
  //
  // The data is the LAST four numbers on the line. Addresses are
  // full of numbers — "14622 N 18TH DR" contributes two — so
  // reading left to right or guessing by magnitude both fail. A
  // street number read as square footage quietly wrecks $/sq ft
  // and the implied resale figure.
  function parseComps(text) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const tokens = line.match(/[\d,]+\.?\d*/g) || [];
        const nums = tokens
          .slice(-4)
          .map((n) => parseFloat(n.replace(/,/g, "")));

        const address = line
          .replace(/(?:[\d,]+\.?\d*[\s$]+){3}\$?[\d,]+\.?\d*\s*$/, "")
          .replace(/[,\s]+$/, "")
          .trim();

        const status = /pend/i.test(line)
          ? "pending"
          : /activ/i.test(line)
          ? "active"
          : /ucb|backup/i.test(line)
          ? "ucb"
          : "closed";

        const [list, sqft, psf, sold] = nums;

        return {
          address: address || line,
          comp_status: status,
          list_price: list ?? null,
          approx_sqft: sqft ?? null,
          price_per_sqft: psf ?? (sold && sqft ? +(sold / sqft).toFixed(2) : null),
          sold_price: sold ?? null,
        };
      })
      .filter((c) => c.sold_price || c.list_price);
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      // Anything typed or pasted can still arrive as "$525,000"
      const NUM_FIELDS = [
        "year_built", "lot_sqft", "lot_acres", "living_area_sqft", "added_sqft",
        "post_reno_sqft", "assessed_tax_amount", "bathrooms", "purchase_price",
        "assumption_overrides", "list_price", "rehab_budget", "furniture_budget", "target_bedrooms",
        "target_bathrooms", "target_ensuites", "bedrooms", "ensuite_count",
      ];
      const clean = { ...d };
      for (const f of NUM_FIELDS) {
        if (clean[f] === "" || clean[f] === undefined) {
          clean[f] = null;
        } else if (typeof clean[f] === "string") {
          const n = parseFloat(clean[f].replace(/[^0-9.\-]/g, ""));
          clean[f] = Number.isFinite(n) ? n : null;
        }
      }

      const payload = {
        bedrooms: clean.bedrooms ?? 0,
        ...clean,
        slug: d.slug || slugify(d.address_line || "", d.city || ""),
        post_reno_sqft:
          clean.post_reno_sqft ??
          (clean.living_area_sqft
            ? clean.living_area_sqft + (clean.added_sqft || 0)
            : null),
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

      <DocumentIntake onApply={applyExtraction} />

      <Section title="Location" source="assessor record">
        <Input label="Street address" value={d.address_line} onChange={set("address_line")} span={2} />
        <Input label="City" value={d.city} onChange={set("city")} />
        <Input
          label="ZIP"
          value={d.zip}
          onChange={(v) => {
            // Market data keys on five digits — a +4 extension never matches
            const five = String(v || "").replace(/\D/g, "").slice(0, 5);
            set("zip")(five);
            setM("zip")(five);
          }}
        />
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

      <Section title="Target conversion" source="what you're underwriting to">
        <Input label="Target bedrooms" type="number" value={d.target_bedrooms} onChange={set("target_bedrooms")} hint="e.g. 9" />
        <Input label="Target baths" type="number" step={0.5} value={d.target_bathrooms} onChange={set("target_bathrooms")} hint="common baths only — ensuites are counted below" />
        <Input label="Of those, ensuites" type="number" value={d.target_ensuites} onChange={set("target_ensuites")} hint="each adds a bathroom to the total" />
        <div className="col-span-2 flex items-end sm:col-span-1">
          <div className="w-full rounded bg-neutral-950 px-3 py-2">
            <div className="text-[9px] uppercase tracking-wider text-neutral-500">Conversion</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: "#00A651" }}>
              {d.target_bedrooms || "?"} /{" "}
              {(() => {
                // An ensuite bedroom contains a bathroom, so the badge
                // shows the total. Entering 1 common bath and 6 ensuites
                // is a 7-bath house, and the floor plan says so.
                const common = Number(d.target_bathrooms) || 0;
                const ens = Number(d.target_ensuites) || 0;
                if (!common && !ens) return "?";
                return ens && ens <= common ? common : common + ens;
              })()}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Configuration & pricing">
        <Input label="Marketed baths" type="number" step={0.5} value={d.bathrooms} onChange={set("bathrooms")} hint="Usually same as target" />
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

      {d.id && <MediaUploader deal={d} onSaved={(saved) => setD((p) => ({ ...p, ...saved }))} />}

      {/* Per-deal overrides. Every figure the pro forma uses, settable
          here from what this house actually costs. Blank falls back to
          the org standard, so an empty field is not zero. */}
      <Section title="Underwriting overrides" source="blank uses the org standard">
        <div className="col-span-2 mb-1 sm:col-span-4">
          <p className="text-[11px] leading-snug text-neutral-500">
            Anything set here overrides the standard for this property only,
            and flows to the pro forma, the flyer, the buyer sheet and every
            share link. Leave a field blank to keep using the standard.
          </p>
        </div>

        {[
          ["property_taxes_annual", "Property taxes / yr", "$", "from the assessed bill x reclass"],
          ["insurance_annual", "Insurance / yr", "$", "org: insurance_annual"],
          ["opex_per_room", "Opex per room / mo", "$", "org: opex_per_room"],
          ["utilities_annual", "Utilities / yr", "$", "overrides opex split"],
          ["repairs_annual", "Repairs & maintenance / yr", "$", "no org default"],
          ["turnover_annual", "Turnover / make-ready / yr", "$", "no org default"],
          ["vacancy_rate", "Vacancy rate", "", "0.05 = 5%"],
          ["maintenance_rate", "Capital reserve rate", "", "0.02 = 2% of net"],
          ["interest_rate", "Interest rate", "", "0.065 = 6.5%"],
          ["ltv", "Loan to value", "", "0.75 = 75%"],
          ["origination_points", "Origination", "", "0.015 = 1.5%"],
          ["closing_costs", "Closing costs", "$", "org: closing_costs"],
        ].map(([key, label, prefix, hint]) => (
          <Input
            key={key}
            label={label}
            type="number"
            step="any"
            prefix={prefix || undefined}
            value={d.assumption_overrides?.[key] ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setD((p) => {
                const next = { ...(p.assumption_overrides || {}) };
                if (v === "") delete next[key];
                else next[key] = Number(v);
                return { ...p, assumption_overrides: next };
              });
            }}
            hint={hint}
          />
        ))}
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
