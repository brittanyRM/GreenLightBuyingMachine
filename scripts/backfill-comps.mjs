#!/usr/bin/env node
// ============================================================
// Go through documents already stored against deals, find the ones
// that carry a flexmls export, and import the comps.
//
//   node scripts/backfill-comps.mjs                 inventory only
//   node scripts/backfill-comps.mjs --deal <slug>   one deal
//   node scripts/backfill-comps.mjs --write         import what it can
//   node scripts/backfill-comps.mjs --ocr           attempt scans too
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
//
// ---------------------------------------------------------------
// Why this reports far more than it writes
//
// The comps PDFs in this system are scans. Eight pages, eight JPEGs,
// zero embedded fonts — there is no text layer to read, so the only
// way in is OCR. Measured against a clean copy of the same export,
// OCR on one of these scans got 6 rows of 15 right and lost 2 rows
// entirely. Among the failures: two MLS numbers off by a digit, and
// three list prices read as 520, 241 and 281 rather than $520,000,
// $241,000 and $281,000 — off by a factor of a thousand, and each one
// still a perfectly plausible-looking number sitting in a column.
//
// So OCR output is never written. With --ocr this prints a draft for
// a person to check against the original; the import path is for
// documents that carry real text.
//
// The reliable route for a scan is to re-run the search in flexmls and
// copy the text, then paste it into the importer on the deal's Record
// tab. Same parser, no guessing.
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseFlexmlsExport,
  normalizeOcrText,
  auditComps,
} from "../lib/flexmlsImport.js";

const run = promisify(execFile);

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(URL_, KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : null;
};
const WRITE = has("--write");
const OCR = has("--ocr");
const ONLY = val("--deal");

const money = (n) =>
  n == null ? "—" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

// ---------------------------------------------------------------

async function bytesFor(doc) {
  if (doc.storage_path) {
    const { data, error } = await db.storage.from("deal-documents").download(doc.storage_path);
    if (error) throw new Error(error.message);
    return Buffer.from(await data.arrayBuffer());
  }
  if (doc.public_url) {
    const res = await fetch(doc.public_url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("no storage_path or public_url");
}

// pdftotext is in poppler-utils. Absent, everything is treated as a
// scan, which fails safe.
async function textLayer(pdfPath) {
  try {
    const out = pdfPath.replace(/\.pdf$/, ".txt");
    await run("pdftotext", ["-layout", pdfPath, out]);
    return await readFile(out, "utf8");
  } catch {
    return "";
  }
}

async function ocrPages(pdfPath, dir) {
  try {
    await run("pdftoppm", ["-r", "300", "-png", pdfPath, join(dir, "pg")]);
  } catch {
    return "";
  }
  const { stdout } = await run("sh", ["-c", `ls ${dir}/pg*.png 2>/dev/null || true`]);
  const pages = stdout.split("\n").filter(Boolean);
  let all = "";
  for (const p of pages) {
    try {
      await run("tesseract", [p, p.replace(/\.png$/, ""), "--psm", "6"]);
      all += (await readFile(p.replace(/\.png$/, "") + ".txt", "utf8")) + "\n";
    } catch {
      /* page unreadable; the row count in the report will show it */
    }
  }
  return all;
}

// ---------------------------------------------------------------

async function main() {
  let q = db
    .from("deal_documents")
    .select("id, deal_id, doc_type, title, storage_path, public_url, file_type, created_at")
    .order("created_at", { ascending: false });

  const { data: docs, error } = await q;
  if (error) throw new Error(error.message);

  const { data: deals } = await db.from("deals").select("id, slug, address_line");
  const dealById = new Map((deals || []).map((d) => [d.id, d]));

  const candidates = (docs || []).filter((d) => {
    const deal = dealById.get(d.deal_id);
    if (!deal) return false;
    if (ONLY && deal.slug !== ONLY) return false;
    const looksRight =
      /comp/i.test(d.doc_type || "") ||
      /comp|mls|flexmls|listing/i.test(d.title || "");
    return looksRight && (d.file_type || "").toLowerCase().includes("pdf");
  });

  console.log(`${docs?.length || 0} documents stored, ${candidates.length} look like comp exports.\n`);
  if (!candidates.length) {
    console.log("Nothing to do. Comp packages are recognised by doc_type containing");
    console.log('"comp", or a title mentioning comps, MLS or flexmls.');
    return;
  }

  const totals = { text: 0, scan: 0, parsed: 0, inserted: 0, updated: 0, skipped: 0 };

  for (const doc of candidates) {
    const deal = dealById.get(doc.deal_id);
    console.log("─".repeat(70));
    console.log(`${deal.address_line}  (${deal.slug})`);
    console.log(`  ${doc.title}   ${doc.created_at?.slice(0, 10)}`);

    let dir;
    try {
      const bytes = await bytesFor(doc);
      dir = await mkdtemp(join(tmpdir(), "comps-"));
      const pdf = join(dir, "doc.pdf");
      await writeFile(pdf, bytes);

      let text = await textLayer(pdf);
      let viaOcr = false;

      // A page of text is a few thousand characters. Anything under a
      // few hundred across a whole document is a scan with a stray
      // watermark, not a readable file.
      if (text.replace(/\s/g, "").length < 200) {
        totals.scan++;
        if (!OCR) {
          console.log("  SCAN — no text layer. Re-export from flexmls and paste it");
          console.log("         into the deal's Record tab, or re-run with --ocr to");
          console.log("         see a draft that needs checking by hand.");
          totals.skipped++;
          continue;
        }
        console.log("  SCAN — running OCR. Output is a draft, not an import.");
        text = normalizeOcrText(await ocrPages(pdf, dir));
        viaOcr = true;
      } else {
        totals.text++;
      }

      const { comps, warnings } = parseFlexmlsExport(viaOcr ? text : text);
      totals.parsed += comps.length;

      if (!comps.length) {
        console.log("  No comp rows recognised in this document.");
        totals.skipped++;
        continue;
      }

      const byStatus = comps.reduce((a, c) => {
        a[c.comp_status] = (a[c.comp_status] || 0) + 1;
        return a;
      }, {});
      console.log(
        `  ${comps.length} rows — ` +
          Object.entries(byStatus)
            .map(([k, v]) => `${v} ${k}`)
            .join(", ")
      );

      for (const c of comps) {
        console.log(
          `    ${c.mls_number}  ${String(c.approx_sqft ?? "—").padStart(5)} sqft  ` +
            `${money(c.sold_price ?? c.list_price).padStart(9)}  ${c.address}`
        );
      }

      const notes = auditComps(comps);
      if (notes.length) {
        console.log("  Check these:");
        notes.forEach((n) => console.log(`    ! ${n}`));
      }
      warnings.forEach((w) => console.log(`    ? skipped — ${w.reason}: ${w.line.slice(0, 60)}`));

      if (viaOcr) {
        console.log("  NOT WRITTEN — OCR output is checked by a person, never imported.");
        totals.skipped++;
        continue;
      }
      if (!WRITE) {
        console.log("  Dry run. Re-run with --write to import these.");
        continue;
      }

      const { data: existing } = await db
        .from("deal_comps")
        .select("id, mls_number, sold_price, list_price")
        .eq("deal_id", deal.id);
      const prior = new Map((existing || []).map((c) => [c.mls_number, c]));

      const ins = comps.filter((c) => !prior.has(c.mls_number));
      const upd = comps.filter((c) => {
        const p = prior.get(c.mls_number);
        return (
          p &&
          (Number(p.sold_price) !== Number(c.sold_price) ||
            Number(p.list_price) !== Number(c.list_price))
        );
      });

      const observed = (doc.created_at || new Date().toISOString()).slice(0, 10);
      if (ins.length) {
        const { error: e } = await db.from("deal_comps").insert(
          ins.map((c) => ({
            ...c,
            deal_id: deal.id,
            source: "ARMLS flexmls export (backfilled from stored document)",
            observed_on: observed,
          }))
        );
        if (e) throw new Error(e.message);
      }
      for (const c of upd) {
        const { id, ...fields } = { ...c, id: prior.get(c.mls_number).id };
        const { error: e } = await db
          .from("deal_comps")
          .update({ ...fields, observed_on: observed })
          .eq("id", id);
        if (e) throw new Error(e.message);
      }

      totals.inserted += ins.length;
      totals.updated += upd.length;
      console.log(`  Wrote ${ins.length} new, updated ${upd.length}.`);
    } catch (e) {
      console.log(`  FAILED — ${e.message}`);
      totals.skipped++;
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log("─".repeat(70));
  console.log(
    `${totals.text} readable, ${totals.scan} scanned, ${totals.parsed} rows parsed, ` +
      `${totals.inserted} inserted, ${totals.updated} updated, ${totals.skipped} left alone.`
  );
  if (!WRITE && totals.text) console.log("Dry run — nothing was written. Add --write.");
  if (totals.scan)
    console.log(
      `${totals.scan} scanned document${totals.scan === 1 ? "" : "s"} need the export ` +
        "pasting in by hand; the parser is the same either way."
    );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
