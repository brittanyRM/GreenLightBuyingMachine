import { NextResponse } from "next/server";
import { admin } from "../../../../../../lib/supabaseAdmin";
import { requireTeam } from "../../../../../../lib/buyerAuth";
import { parseFlexmlsExport, auditComps } from "../../../../../../lib/flexmlsImport";

export const dynamic = "force-dynamic";

// ============================================================
// Import comps onto a deal from a pasted flexmls export.
//
// Paste rather than file upload, deliberately. The export arrives as a
// PDF, and reading tables out of a PDF server-side is a guess that
// fails quietly on a layout change. Selecting the text and pasting it
// is one extra action for a person and removes an entire category of
// silent wrongness.
//
// POST with { text, dryRun } — dryRun returns what would be written
// without writing it, so the preview and the import run the same code
// and cannot disagree about what is about to happen.
// ============================================================

export async function POST(req, { params }) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { text, dryRun = false, observedOn = null } = await req
    .json()
    .catch(() => ({}));

  if (!text || !String(text).trim()) {
    return NextResponse.json({ error: "Nothing to import." }, { status: 400 });
  }

  const { data: deal, error: dealErr } = await admin()
    .from("deals")
    .select("id, slug, address_line")
    .eq("slug", params.slug)
    .maybeSingle();

  if (dealErr) return NextResponse.json({ error: dealErr.message }, { status: 500 });
  if (!deal) return NextResponse.json({ error: "Deal not found." }, { status: 404 });

  const { comps, warnings } = parseFlexmlsExport(text);
  if (!comps.length) {
    return NextResponse.json(
      {
        error:
          "No rows recognised. This reads the flexmls summary report — " +
          "the one with MLS number, address, list price and days on market " +
          "in columns.",
        warnings,
      },
      { status: 422 }
    );
  }

  // What is already on this deal, so the response can say which rows
  // are new and which would be updates rather than reporting a count
  // that hides both.
  const { data: existing } = await admin()
    .from("deal_comps")
    .select("id, mls_number, sold_price, list_price")
    .eq("deal_id", deal.id);

  // Matched on MLS number or, failing that, on a normalised address.
  // Comps saved before the importer existed have no MLS number, so
  // keying on it alone would insert a second copy of every house
  // rather than filling in the columns that were missing.
  const norm = (a) =>
    String(a || "").toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
  const byMls = new Map();
  const byAddr = new Map();
  for (const c of existing || []) {
    if (c.mls_number) byMls.set(String(c.mls_number), c);
    if (c.address) byAddr.set(norm(c.address), c);
  }

  const toInsert = [];
  const toUpdate = [];

  for (const c of comps) {
    const prior = byMls.get(String(c.mls_number)) || byAddr.get(norm(c.address));
    if (!prior) toInsert.push(c);
    else if (
      Number(prior.sold_price) !== Number(c.sold_price) ||
      Number(prior.list_price) !== Number(c.list_price)
    ) {
      toUpdate.push({ ...c, id: prior.id });
    }
  }

  const audit = auditComps(comps);
  const summary = {
    deal: deal.address_line,
    parsed: comps.length,
    unchanged: comps.length - toInsert.length - toUpdate.length,
    inserted: toInsert.length,
    updated: toUpdate.length,
    byStatus: comps.reduce((a, c) => {
      a[c.comp_status] = (a[c.comp_status] || 0) + 1;
      return a;
    }, {}),
    audit,
    warnings,
  };

  if (dryRun) return NextResponse.json({ ...summary, dryRun: true, comps });

  const source = "ARMLS flexmls export";
  const observed = observedOn || new Date().toISOString().slice(0, 10);

  if (toInsert.length) {
    const { error } = await admin()
      .from("deal_comps")
      .insert(
        toInsert.map((c) => ({
          ...c,
          deal_id: deal.id,
          source,
          observed_on: observed,
        }))
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Prices move. A listing reduced since the last pull should update
  // rather than sit next to its own stale twin, which is what the
  // partial unique index on (deal_id, mls_number) is there to prevent.
  for (const c of toUpdate) {
    const { id, ...fields } = c;
    const { error } = await admin()
      .from("deal_comps")
      .update({ ...fields, source, observed_on: observed })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ...summary, dryRun: false });
}
