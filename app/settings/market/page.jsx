"use client";

// ============================================================
// /settings/market — PadSplit data by ZIP.
//
// Rows can exist for ZIPs we have no deal in, because the buyer map
// shows a property against its neighbours and those neighbours need
// numbers.
//
// The recorded date is on every row: occupancy quoted from an old
// pull is worse than no occupancy at all, and this is the only place
// that staleness is visible.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/queries";

const GREEN = "#00A651";
const STALE_DAYS = 90;

async function api(url, { method = "GET", body } = {}) {
  const res = await apiFetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) throw new Error(json?.error || `Failed with ${res.status}`);
  return json;
}

const FIELDS = [
  ["zip", "ZIP", "85304", 5],
  ["metro", "Metro", "Phoenix", 8],
  ["active_units", "Active", "29", 5],
  ["upcoming_units", "Upcoming", "0", 5],
  ["shared_weekly", "Shared $/wk", "223", 6],
  ["private_weekly", "Private $/wk", "282", 6],
  ["avg_occupancy", "Occupancy", "95", 6],
  ["days_to_first_booking", "To 1st booking", "12", 6],
  ["latitude", "Latitude", "33.5670", 8],
  ["longitude", "Longitude", "-112.1780", 8],
];

export default function MarketSettings() {
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState({});
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const j = await api("/api/market");
      setRows(j.markets || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api("/api/market", { method: "POST", body: draft });
      setMsg(`${draft.zip} saved.`);
      setDraft({});
      setEditing(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(zip) {
    if (!confirm(`Remove ${zip}? Any deal in that ZIP loses its market rates.`)) return;
    setBusy(true);
    try {
      await api("/api/market", { method: "DELETE", body: { zip } });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const age = (d) =>
    d ? Math.round((Date.now() - new Date(d).getTime()) / 864e5) : null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 font-sans">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">PadSplit market data</h1>
          <p className="mt-1 text-[13px] leading-snug text-neutral-600">
            Room rates and occupancy by ZIP. Deals fall back to these when they
            carry no rate of their own, and the buyer map plots every ZIP that
            has coordinates.
          </p>
        </div>
        <a href="/settings" className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-900">
          ← Settings
        </a>
      </div>

      {error && (
        <div className="mt-4 rounded border-l-4 border-red-600 bg-red-50 px-4 py-3 text-[13px] text-red-900">
          {error}
        </div>
      )}
      {msg && !error && (
        <div className="mt-4 text-[12px]" style={{ color: GREEN }}>{msg}</div>
      )}

      <div className="mt-5 rounded border border-neutral-200 bg-white p-4">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-900">
          {editing ? `Editing ${editing}` : "Add or update a ZIP"}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {FIELDS.map(([key, label, placeholder]) => (
            <label key={key} className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
                {label}
              </span>
              <input
                value={draft[key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                placeholder={placeholder}
                disabled={key === "zip" && !!editing}
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-[#00A651] disabled:bg-neutral-100"
              />
            </label>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={busy || !draft.zip}
            className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-40"
            style={{ backgroundColor: GREEN }}
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Add ZIP"}
          </button>
          {editing && (
            <button
              onClick={() => { setEditing(null); setDraft({}); }}
              className="text-[11px] text-neutral-500 underline underline-offset-2"
            >
              Cancel
            </button>
          )}
          <span className="text-[11px] text-neutral-500">
            Occupancy as 95 or 0.95 — either works. Without latitude and
            longitude the ZIP stays off the map.
          </span>
        </div>
      </div>

      {rows && rows.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded border border-neutral-200 bg-white">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                {["ZIP", "Metro", "Active", "Shared", "Private", "Occupancy", "On map", "Recorded", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-[9px] font-black uppercase tracking-wider text-neutral-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const days = age(r.fetched_at);
                const stale = days != null && days > STALE_DAYS;
                return (
                  <tr key={r.zip} className="border-b border-neutral-100 last:border-b-0">
                    <td className="px-3 py-2 text-[13px] font-bold text-neutral-900">{r.zip}</td>
                    <td className="px-3 py-2 text-[12px] text-neutral-600">{r.metro || "—"}</td>
                    <td className="px-3 py-2 text-[12px] tabular-nums">{r.active_units ?? "—"}</td>
                    <td className="px-3 py-2 text-[12px] tabular-nums">
                      {r.shared_weekly ? `$${r.shared_weekly}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-[12px] tabular-nums">
                      {r.private_weekly ? `$${r.private_weekly}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-[12px] font-semibold tabular-nums">
                      {r.avg_occupancy ? `${Math.round(r.avg_occupancy * 100)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-[11px]">
                      {r.latitude ? (
                        <span style={{ color: GREEN }}>yes</span>
                      ) : (
                        <span className="text-amber-700">no coords</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px]" style={{ color: stale ? "#B45309" : "#6B7280" }}>
                      {days == null ? "—" : days === 0 ? "today" : `${days}d ago`}
                      {stale ? " · stale" : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => {
                          setEditing(r.zip);
                          setDraft({
                            ...r,
                            avg_occupancy: r.avg_occupancy != null ? r.avg_occupancy * 100 : "",
                          });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(r.zip)}
                        className="ml-3 text-[11px] text-neutral-500 underline underline-offset-2 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="mt-5 rounded border border-neutral-200 bg-white px-4 py-6 text-[13px] text-neutral-600">
          No market data yet. Add the ZIPs your deals sit in, plus the ones
          around them so the map has neighbours to compare against.
        </div>
      )}
    </div>
  );
}
