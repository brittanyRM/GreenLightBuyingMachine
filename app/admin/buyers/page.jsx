"use client";

// ============================================================
// /admin/buyers — buyer firms, their people, and incoming interest.
//
// Deliberately NOT under /buyers: that prefix is public in AuthGate,
// so anything beneath it would skip team auth. This sits at /admin so
// it stays behind the same gate as the rest of the app, and every
// call goes through apiFetch, which the API routes verify.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/queries";

// apiFetch returns a raw Response, defaults to POST when no method is
// given, and does not serialise the body. Reading `.orgs` straight off
// a Response yields undefined, which rendered as "no buyers yet" no
// matter what the server said — so every call goes through here.
async function api(url, { method = "GET", body } = {}) {
  const res = await apiFetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    throw new Error(`${url} returned a non-JSON response (${res.status}).`);
  }
  if (!res.ok || json?.error) {
    throw new Error(json?.error || `${url} failed with ${res.status}.`);
  }
  return json;
}
import { usd } from "../../../lib/proformaClub";
import { describeBuyBox, parseList } from "../../../lib/buyBox";

const GREEN = "#00A651";

// Must stay in step with SECTIONS in components/ClubProForma.jsx and
// BUYER_VIEW_IDS in the orgs admin route.
const BUYER_VIEWS = [
  ["summary", "Summary"],
  ["numbers", "Pro forma"],
  ["property", "The property"],
  ["market", "Comps & market"],
  ["diligence", "Diligence"],
  ["syndication", "Syndication"],
];
const DEFAULT_BUYER_VIEWS = ["summary", "numbers", "property", "market", "diligence"];

function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </span>
      <input
        {...props}
        className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-[#00A651]"
      />
    </label>
  );
}

function Pill({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-neutral-100 text-neutral-600",
    good: "text-white",
    warn: "bg-amber-100 text-amber-800",
    off: "bg-neutral-200 text-neutral-500",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${tones[tone]}`}
      style={tone === "good" ? { backgroundColor: GREEN } : undefined}
    >
      {children}
    </span>
  );
}

export default function BuyerAdmin() {
  const [tab, setTab] = useState("firms");
  const [orgs, setOrgs] = useState(null);
  const [interest, setInterest] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [needsBuyBox, setNeedsBuyBox] = useState(false);
  const [boxOpen, setBoxOpen] = useState({});
  const [boxDraft, setBoxDraft] = useState({});
  const [options, setOptions] = useState(null);
  const [needsOptions, setNeedsOptions] = useState(false);
  const [optDraft, setOptDraft] = useState({});
  const [editingOpt, setEditingOpt] = useState(null);
  const [assignments, setAssignments] = useState(null);
  const [needsAssign, setNeedsAssign] = useState(false);
  const [requests, setRequests] = useState(null);
  const [reply, setReply] = useState({});
  const [optError, setOptError] = useState(null);

  const [newOrg, setNewOrg] = useState("");
  const [newUser, setNewUser] = useState({});
  const [link, setLink] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [o, i] = await Promise.all([
        api("/api/buyer/admin/orgs"),
        api("/api/buyer/admin/interest"),
      ]);

      // Assignments. Separate so a missing migration can't take the
      // buyer list down with it.
      try {
        const a = await api("/api/buyer/admin/assign");
        setAssignments(a.assignments || []);
        setNeedsAssign(!!a.unavailable);
      } catch {
        setAssignments([]);
        setNeedsAssign(true);
      }

      try {
        const rq = await api("/api/buyer/admin/requests");
        setRequests(rq.requests || []);
      } catch {
        setRequests([]);
      }

      // Separate call: lender options depend on migration 026 and
      // shouldn't take the buyer list down if it hasn't run.
      try {
        const f = await api("/api/buyer/admin/financing");
        setOptions(f.options || []);
        setNeedsOptions(!!f.unavailable);
      } catch {
        setOptions([]);
        setNeedsOptions(true);
      }
      setOrgs(o.orgs || []);
      setNeedsMigration(!!o.needsMigration);
      setNeedsBuyBox(!!o.needsBuyBoxMigration);
      setInterest(i.interest || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const createOrg = () =>
    run(async () => {
      if (!newOrg.trim()) throw new Error("Give the buyer a name.");
      await api("/api/buyer/admin/orgs", { method: "POST", body: { name: newOrg.trim() } });
      setNewOrg("");
    });

  const addUser = (orgId) =>
    run(async () => {
      const u = newUser[orgId] || {};
      if (!u.email) throw new Error("An email address is required.");
      await api("/api/buyer/admin/users", {
        method: "POST",
        body: {
          org_id: orgId,
          email: u.email.trim(),
          name: u.name || null,
          password: u.password || null,
        },
      });
      setNewUser((s) => ({ ...s, [orgId]: {} }));
    });

  const patchUser = (id, patch) =>
    run(() => api("/api/buyer/admin/users", { method: "PATCH", body: { id, ...patch } }));

  const patchOrg = (id, patch) =>
    run(() => api("/api/buyer/admin/orgs", { method: "PATCH", body: { id, ...patch } }));

  const makeLink = (userId) =>
    run(async () => {
      const res = await api("/api/buyer/admin/magic", {
        method: "POST",
        body: { user_id: userId, hours: 48 },
      });
      setLink(res.url);
      try {
        await navigator.clipboard.writeText(res.url);
      } catch {
        // Clipboard blocked; the URL is shown regardless.
      }
    });

  const saveBox = (orgId) =>
    run(async () => {
      const d = boxDraft[orgId] || {};
      await api("/api/buyer/admin/buybox", {
        method: "POST",
        body: {
          org_id: orgId,
          min_price: d.min_price ?? "",
          max_price: d.max_price ?? "",
          min_bedrooms: d.min_bedrooms ?? "",
          min_bathrooms: d.min_bathrooms ?? "",
          min_sqft: d.min_sqft ?? "",
          min_year_built: d.min_year_built ?? "",
          min_dscr: d.min_dscr ?? "",
          min_cap_rate: d.min_cap_rate ?? "",
          scenario: d.scenario || "base",
          cities: parseList(d.cities),
          zips: parseList(d.zips),
          states: parseList(d.states),
          notes: d.notes || null,
        },
      });
      setBoxOpen((s2) => ({ ...s2, [orgId]: false }));
    });

  const removeAssignment = (id) =>
    run(() => api("/api/buyer/admin/assign", { method: "DELETE", body: { id } }));

  const releaseAssignment = (slug, orgId) =>
    run(() =>
      api("/api/buyer/admin/assign", {
        method: "POST",
        body: { slug, org_id: orgId, status: "released" },
      })
    );

  const answerRequest = (id, status) =>
    run(() =>
      api("/api/buyer/admin/requests", {
        method: "PATCH",
        body: { id, status, ...(reply[id] ? { response: reply[id] } : {}) },
      })
    );

  const saveOption = () => {
    // Checked here rather than thrown up to the page-level banner —
    // an error 900px from the button that caused it isn't an error
    // message, it's a puzzle.
    if (!optDraft.label?.trim()) {
      setOptError("Name is required — it's what the buyer sees as the heading.");
      return;
    }
    setOptError(null);
    return run(async () => {
      await api("/api/buyer/admin/financing", {
        method: "POST",
        body: { ...optDraft, id: editingOpt || undefined },
      });
      setOptDraft({});
      setEditingOpt(null);
    });
  };

  const deleteOption = (id) =>
    run(() => api("/api/buyer/admin/financing", { method: "DELETE", body: { id } }));

  const setStatus = (id, status) =>
    run(() => api("/api/buyer/admin/interest", { method: "PATCH", body: { id, status } }));

  const newCount = (interest || []).filter((i) => i.status === "new").length;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 font-sans">
      <h1 className="text-2xl font-bold text-neutral-900">Buyers</h1>
      <p className="mt-1 text-[13px] text-neutral-600">
        Buyers with portal access, and what they&rsquo;ve raised a hand on.
      </p>

      <div className="mt-5 flex gap-1">
        {[
          { id: "firms", label: "Buyers & people" },
          { id: "interest", label: newCount ? `Interest (${newCount} new)` : "Interest" },
          { id: "requests", label: requests?.filter((r) => r.status === "new").length ? `Research (${requests.filter((r) => r.status === "new").length} new)` : "Research" },
          { id: "assigned", label: assignments?.length ? `Assigned (${assignments.length})` : "Assigned" },
          { id: "financing", label: "Lender options" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
              tab === t.id ? "text-white" : "bg-neutral-100 text-neutral-500 hover:text-neutral-900"
            }`}
            style={tab === t.id ? { backgroundColor: GREEN } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded border-l-4 border-red-600 bg-red-50 px-4 py-3 text-[13px] text-red-900">
          {error}
        </div>
      )}

      {needsBuyBox && (
        <div className="mt-4 rounded border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <strong>Migration 023 hasn&rsquo;t been run.</strong> Buy boxes are
          unavailable until you run <code>023_buyer_buy_boxes.sql</code>.
        </div>
      )}

      {needsMigration && (
        <div className="mt-4 rounded border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <strong>Migration 021 hasn&rsquo;t been run.</strong> Everything below
          works, but buyer logos are unavailable until you run{" "}
          <code>021_buyer_org_branding.sql</code>.
        </div>
      )}

      {link && (
        <div className="mt-4 rounded border-l-4 bg-neutral-50 px-4 py-3" style={{ borderColor: GREEN }}>
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: GREEN }}>
            Sign-in link copied — valid 48 hours, single use
          </div>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            className="mt-1.5 w-full rounded border border-neutral-300 px-2 py-1 text-[12px]"
          />
          <p className="mt-1.5 text-[11px] text-neutral-500">
            Send it however you&rsquo;re already talking to them — this works
            whether or not Gmail is connected.
          </p>
          <button
            onClick={() => setLink(null)}
            className="mt-2 text-[11px] text-neutral-500 underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ---------------- firms ---------------- */}
      {tab === "firms" && (
        <div className="mt-5">
          <div className="mb-5 flex items-end gap-2 rounded border border-neutral-200 bg-white p-4">
            <div className="flex-1">
              <Field
                label="Add a buyer"
                value={newOrg}
                onChange={(e) => setNewOrg(e.target.value)}
                placeholder="Mogul"
              />
            </div>
            <button
              onClick={createOrg}
              disabled={busy}
              className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
              style={{ backgroundColor: GREEN }}
            >
              Add
            </button>
          </div>

          {!orgs && <div className="text-[13px] text-neutral-500">Loading…</div>}
          {orgs && orgs.length === 0 && (
            <div className="rounded border border-neutral-200 bg-white px-4 py-6 text-[13px] text-neutral-600">
              No buyers yet.
            </div>
          )}

          {(orgs || []).map((org) => {
            const draft = newUser[org.id] || {};
            return (
              <div key={org.id} className="mb-4 rounded border border-neutral-200 bg-white">
                <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 px-4 py-3">
                  {org.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={org.logo_url} alt="" className="h-5 w-auto" />
                  ) : null}
                  <h2 className="text-[14px] font-bold text-neutral-900">{org.name}</h2>
                  <Pill tone={org.active ? "good" : "off"}>
                    {org.active ? "Active" : "Disabled"}
                  </Pill>
                  <span className="text-[11px] text-neutral-400">/{org.slug}</span>

                  <button
                    onClick={() => patchOrg(org.id, { active: !org.active })}
                    disabled={busy}
                    className="ml-auto text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                  >
                    {org.active ? "Disable buyer" : "Re-enable"}
                  </button>
                </div>

                <div className="px-4 py-2">
                  {(org.buyer_users || []).length === 0 && (
                    <div className="py-2 text-[12px] text-neutral-500">Nobody added yet.</div>
                  )}

                  {(org.buyer_users || []).map((u) => (
                    <div
                      key={u.id}
                      className="flex flex-wrap items-center gap-2 border-b border-neutral-100 py-2 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-neutral-900">
                          {u.name || u.email}
                        </div>
                        <div className="truncate text-[11px] text-neutral-500">
                          {u.email}
                          {u.last_login_at
                            ? ` · last in ${new Date(u.last_login_at).toLocaleDateString()}`
                            : " · never signed in"}
                        </div>
                      </div>

                      <Pill tone={u.has_password ? "neutral" : "warn"}>
                        {u.has_password ? "Password set" : "Link only"}
                      </Pill>
                      {!u.active && <Pill tone="off">Disabled</Pill>}

                      <button
                        onClick={() => makeLink(u.id)}
                        disabled={busy}
                        className="rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
                        style={{ backgroundColor: GREEN }}
                      >
                        Sign-in link
                      </button>

                      <button
                        onClick={() => {
                          const pw = prompt(`New password for ${u.email} (8+ characters)`);
                          if (pw) patchUser(u.id, { password: pw });
                        }}
                        disabled={busy}
                        className="text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                      >
                        Set password
                      </button>

                      <button
                        onClick={() => patchUser(u.id, { active: !u.active })}
                        disabled={busy}
                        className="text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                      >
                        {u.active ? "Revoke" : "Restore"}
                      </button>
                    </div>
                  ))}

                  <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-3">
                    <div className="w-52">
                      <Field
                        label="Email"
                        value={draft.email || ""}
                        onChange={(e) =>
                          setNewUser((s) => ({ ...s, [org.id]: { ...draft, email: e.target.value } }))
                        }
                        placeholder="name@company.com"
                      />
                    </div>
                    <div className="w-40">
                      <Field
                        label="Name"
                        value={draft.name || ""}
                        onChange={(e) =>
                          setNewUser((s) => ({ ...s, [org.id]: { ...draft, name: e.target.value } }))
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="w-40">
                      <Field
                        label="Password"
                        type="password"
                        value={draft.password || ""}
                        onChange={(e) =>
                          setNewUser((s) => ({
                            ...s,
                            [org.id]: { ...draft, password: e.target.value },
                          }))
                        }
                        placeholder="Blank = link only"
                      />
                    </div>
                    <button
                      onClick={() => addUser(org.id)}
                      disabled={busy}
                      className="rounded px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-700 ring-1 ring-neutral-300 disabled:opacity-50"
                    >
                      Add person
                    </button>
                  </div>

                  {!needsBuyBox && (
                    <div className="mt-3 border-t border-neutral-200 pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
                          Buy box
                        </span>
                        <span className="text-[12px] text-neutral-700">
                          {describeBuyBox(org.buy_box)}
                        </span>
                        <button
                          onClick={() => {
                            const b = org.buy_box || {};
                            setBoxDraft((s2) => ({
                              ...s2,
                              [org.id]: {
                                min_price: b.min_price ?? "",
                                max_price: b.max_price ?? "",
                                min_bedrooms: b.min_bedrooms ?? "",
                                min_bathrooms: b.min_bathrooms ?? "",
                                min_sqft: b.min_sqft ?? "",
                                min_year_built: b.min_year_built ?? "",
                                min_dscr: b.min_dscr ?? "",
                                min_cap_rate: b.min_cap_rate ?? "",
                                scenario: b.scenario || "base",
                                cities: (b.cities || []).join(", "),
                                zips: (b.zips || []).join(", "),
                                states: (b.states || []).join(", "),
                                notes: b.notes || "",
                              },
                            }));
                            setBoxOpen((s2) => ({ ...s2, [org.id]: !s2[org.id] }));
                          }}
                          className="text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                        >
                          {boxOpen[org.id] ? "Close" : org.buy_box ? "Edit" : "Set one"}
                        </button>
                      </div>

                      {boxOpen[org.id] && (
                        <div className="mt-3 rounded bg-neutral-50 p-3">
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {[
                              ["min_price", "Min price"],
                              ["max_price", "Max price"],
                              ["min_bedrooms", "Min beds"],
                              ["min_bathrooms", "Min baths"],
                              ["min_sqft", "Min sq ft"],
                              ["min_year_built", "Built after"],
                              ["min_dscr", "Min DSCR"],
                              ["min_cap_rate", "Min cap rate %"],
                            ].map(([k, lbl]) => (
                              <Field
                                key={k}
                                label={lbl}
                                inputMode="decimal"
                                value={(boxDraft[org.id] || {})[k] ?? ""}
                                onChange={(e) =>
                                  setBoxDraft((s2) => ({
                                    ...s2,
                                    [org.id]: { ...(s2[org.id] || {}), [k]: e.target.value },
                                  }))
                                }
                                placeholder="Any"
                              />
                            ))}
                          </div>

                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {[
                              ["cities", "Cities", "Mesa, Gilbert, Chandler"],
                              ["zips", "ZIPs", "85201, 85210"],
                              ["states", "States", "AZ"],
                            ].map(([k, lbl, ph]) => (
                              <Field
                                key={k}
                                label={lbl}
                                value={(boxDraft[org.id] || {})[k] ?? ""}
                                onChange={(e) =>
                                  setBoxDraft((s2) => ({
                                    ...s2,
                                    [org.id]: { ...(s2[org.id] || {}), [k]: e.target.value },
                                  }))
                                }
                                placeholder={ph}
                              />
                            ))}
                          </div>

                          <div className="mt-2 flex flex-wrap items-end gap-3">
                            <label className="block">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                                Yield floors apply to
                              </span>
                              <select
                                value={(boxDraft[org.id] || {}).scenario || "base"}
                                onChange={(e) =>
                                  setBoxDraft((s2) => ({
                                    ...s2,
                                    [org.id]: { ...(s2[org.id] || {}), scenario: e.target.value },
                                  }))
                                }
                                className="mt-1 rounded border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-[#00A651]"
                              >
                                <option value="bear">Bear case</option>
                                <option value="base">Base case</option>
                                <option value="bull">Bull case</option>
                              </select>
                            </label>
                            <span className="pb-2 text-[11px] text-neutral-500">
                              DSCR and cap rate only. Beds, price and location
                              don&rsquo;t vary by case.
                            </span>
                          </div>

                          <div className="mt-2">
                            <Field
                              label="Notes"
                              value={(boxDraft[org.id] || {}).notes ?? ""}
                              onChange={(e) =>
                                setBoxDraft((s2) => ({
                                  ...s2,
                                  [org.id]: { ...(s2[org.id] || {}), notes: e.target.value },
                                }))
                              }
                              placeholder="No septic, 2-car garage preferred…"
                            />
                          </div>

                          <div className="mt-3 flex items-center gap-3">
                            <button
                              onClick={() => saveBox(org.id)}
                              disabled={busy}
                              className="rounded px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
                              style={{ backgroundColor: GREEN }}
                            >
                              Save buy box
                            </button>
                            <span className="text-[11px] text-neutral-500">
                              Blank means no constraint. Matching properties are
                              flagged and sorted first in their portal.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-3">
                    <div className="w-56">
                      <Field
                        label="Logo (light bg)"
                        defaultValue={org.logo_url || ""}
                        onBlur={(e) => {
                          if (e.target.value !== (org.logo_url || ""))
                            patchOrg(org.id, { logo_url: e.target.value });
                        }}
                        placeholder="/buyer-logos/mogul-black.svg"
                      />
                    </div>
                    <div className="w-56">
                      <Field
                        label="Logo (dark bg)"
                        defaultValue={org.logo_dark_url || ""}
                        onBlur={(e) => {
                          if (e.target.value !== (org.logo_dark_url || ""))
                            patchOrg(org.id, { logo_dark_url: e.target.value });
                        }}
                        placeholder="/buyer-logos/mogul-white.svg"
                      />
                    </div>
                    <span className="pb-2 text-[11px] text-neutral-500">
                      Shown in their portal header only. Ask them first.
                    </span>
                  </div>

                  <div className="mt-3 border-t border-neutral-200 pt-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                      Sections this buyer can see
                    </div>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      Unticked sections are removed before the page is sent, not hidden in the
                      browser. Syndication shows the raise, the waterfall and the sponsor promote —
                      give it to firms raising capital, not to someone buying one house.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                      {BUYER_VIEWS.map(([id, label]) => {
                        const current = org.enabled_views || DEFAULT_BUYER_VIEWS;
                        const on = current.includes(id);
                        return (
                          <label key={id} className="flex items-center gap-1.5 text-[12px]">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                patchOrg(org.id, {
                                  enabled_views: on
                                    ? current.filter((v) => v !== id)
                                    : [...current, id],
                                })
                              }
                            />
                            <span className={on ? "text-neutral-900" : "text-neutral-500"}>
                              {label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------------- research requests ---------------- */}
      {tab === "requests" && (
        <div className="mt-5">
          <p className="mb-4 text-[13px] text-neutral-600">
            Buyers who have sent their own comps and asked for market work.
            Answering here shows the reply in their portal.
          </p>

          {requests && requests.length === 0 && (
            <div className="rounded border border-neutral-200 bg-white px-4 py-6 text-[13px] text-neutral-600">
              Nothing yet.
            </div>
          )}

          {(requests || []).map((r) => (
            <div
              key={r.id}
              className="mb-3 rounded border bg-white px-4 py-3"
              style={{ borderColor: r.status === "new" ? GREEN : "#E5E7EB" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-bold text-neutral-900">
                  {r.buyer_orgs?.name}
                </span>
                <Pill tone={r.status === "new" ? "good" : "neutral"}>{r.status}</Pill>
                <Pill tone="neutral">{String(r.kind).replace("_", " ")}</Pill>
                <span className="ml-auto text-[11px] text-neutral-400">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>

              <div className="mt-1 text-[13px] font-semibold text-neutral-800">
                {r.subject || "—"}
                {r.deals?.address_line ? ` · ${r.deals.address_line}` : ""}
              </div>
              <div className="text-[11px] text-neutral-500">
                {r.buyer_users?.name || r.buyer_users?.email}
              </div>

              {r.note && (
                <p className="mt-2 border-l-2 border-neutral-300 pl-3 text-[12px] text-neutral-700">
                  {r.note}
                </p>
              )}

              {r.buyer_request_files?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.buyer_request_files.map((f) => (
                    <a
                      key={f.id}
                      href={f.public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-neutral-300 px-2 py-1 text-[11px] text-neutral-700 hover:border-neutral-500"
                    >
                      {f.file_name}
                      {f.size_bytes ? ` · ${Math.round(f.size_bytes / 1024)}KB` : ""}
                    </a>
                  ))}
                </div>
              )}

              {r.response ? (
                <div
                  className="mt-2 rounded border-l-2 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-800"
                  style={{ borderColor: GREEN }}
                >
                  {r.response}
                </div>
              ) : (
                <div className="mt-3">
                  <textarea
                    rows={3}
                    value={reply[r.id] || ""}
                    onChange={(e) => setReply((s2) => ({ ...s2, [r.id]: e.target.value }))}
                    placeholder="Your findings. This appears in their portal."
                    className="w-full rounded border border-neutral-300 px-2.5 py-2 text-[12px] outline-none focus:border-[#00A651]"
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      onClick={() => answerRequest(r.id, "answered")}
                      disabled={busy || !reply[r.id]}
                      className="rounded px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-40"
                      style={{ backgroundColor: GREEN }}
                    >
                      Send reply
                    </button>
                    <button
                      onClick={() => answerRequest(r.id, "in_progress")}
                      disabled={busy}
                      className="text-[11px] text-neutral-500 underline underline-offset-2"
                    >
                      Mark in progress
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---------------- assigned ---------------- */}
      {tab === "assigned" && (
        <div className="mt-5">
          <p className="mb-4 text-[13px] text-neutral-600">
            Properties allocated to a buyer. Removing an assignment takes the
            badge off their portal — it does not hide the property, which stays
            visible to every buyer while its status is <code>for_sale</code>.
          </p>

          {needsAssign && (
            <div className="mb-4 rounded border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
              <strong>Migration 026 hasn&rsquo;t been run.</strong> Assignments
              are unavailable until you run{" "}
              <code>026_assignments_and_financing.sql</code>.
            </div>
          )}

          {assignments && assignments.length === 0 && !needsAssign && (
            <div className="rounded border border-neutral-200 bg-white px-4 py-6 text-[13px] text-neutral-600">
              Nothing assigned to anyone.
            </div>
          )}

          {(assignments || []).map((a) => {
            const expired = a.expires_at && new Date(a.expires_at) < new Date();
            return (
              <div key={a.id} className="mb-3 rounded border border-neutral-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-bold text-neutral-900">
                    {a.buyer_orgs?.name}
                  </span>
                  <span className="text-[12px] text-neutral-500">
                    {a.deals?.address_line}
                    {a.deals?.city ? `, ${a.deals.city}` : ""}
                  </span>

                  <Pill tone={a.status === "released" || expired ? "off" : "good"}>
                    {expired ? "expired" : a.status}
                  </Pill>

                  {a.deals?.status && (
                    <Pill tone="neutral">{String(a.deals.status).replace("_", " ")}</Pill>
                  )}

                  <button
                    onClick={() => removeAssignment(a.id)}
                    disabled={busy}
                    className="ml-auto text-[11px] text-neutral-500 underline underline-offset-2 hover:text-red-700"
                  >
                    Remove
                  </button>

                  {a.status !== "released" && (
                    <button
                      onClick={() => releaseAssignment(a.deals?.slug, a.org_id)}
                      disabled={busy}
                      className="text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                    >
                      Release
                    </button>
                  )}
                </div>

                <div className="mt-1 text-[11px] text-neutral-500">
                  Assigned {new Date(a.created_at).toLocaleDateString()}
                  {a.expires_at
                    ? ` · ${expired ? "expired" : "expires"} ${new Date(a.expires_at).toLocaleDateString()}`
                    : ""}
                  {a.deals?.status !== "for_sale"
                    ? " · not for sale, so it isn't in any portal"
                    : ""}
                </div>

                {a.note && (
                  <p className="mt-1 text-[12px] text-neutral-600">{a.note}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------------- lender options ---------------- */}
      {tab === "financing" && (
        <div className="mt-5">
          <p className="mb-4 text-[13px] text-neutral-600">
            Financing offered <strong>to buyers</strong> on a property
            they&rsquo;ve raised a hand on. Leave the property blank to offer an
            option on everything. This is separate from our own acquisition
            financing, which buyers never see.
          </p>

          {needsOptions && (
            <div className="mb-4 rounded border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
              <strong>Migration 026 hasn&rsquo;t been run.</strong> Lender
              options are unavailable until you run{" "}
              <code>026_assignments_and_financing.sql</code>.
            </div>
          )}

          <div className="mb-5 rounded border border-neutral-200 bg-white p-4">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-900">
              {editingOpt ? "Edit option" : "Add an option"}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="block">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                    Name <span style={{ color: "#B91C1C" }}>*</span>
                  </span>
                  <input
                    value={optDraft.label || ""}
                    onChange={(e) => {
                      setOptError(null);
                      setOptDraft((d) => ({ ...d, label: e.target.value }));
                    }}
                    placeholder="DSCR — 30 yr"
                    className="mt-1 w-full rounded border px-2.5 py-2 text-[13px] outline-none focus:border-[#00A651]"
                    style={{ borderColor: optError ? "#B91C1C" : "#D4D4D4" }}
                  />
                </label>
                <span className="mt-0.5 block text-[10px] text-neutral-400">
                  Required — the heading a buyer sees
                </span>
              </div>
              <Field
                label="Lender"
                value={optDraft.lender_name || ""}
                onChange={(e) => setOptDraft((d) => ({ ...d, lender_name: e.target.value }))}
              />
              <Field
                label="Loan type"
                value={optDraft.loan_type || ""}
                onChange={(e) => setOptDraft((d) => ({ ...d, loan_type: e.target.value }))}
                placeholder="DSCR, bridge, conventional"
              />
              <Field
                label="Property slug"
                value={optDraft.slug || ""}
                onChange={(e) => setOptDraft((d) => ({ ...d, slug: e.target.value }))}
                placeholder="Blank = all"
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ["max_ltv_pct", "Max LTV %"],
                ["rate_from_pct", "Rate from %"],
                ["term_months", "Term (months)"],
                ["min_dscr", "Min DSCR"],
                ["points", "Points"],
              ].map(([k, lbl]) => (
                <Field
                  key={k}
                  label={lbl}
                  inputMode="decimal"
                  value={optDraft[k] ?? ""}
                  onChange={(e) => setOptDraft((d) => ({ ...d, [k]: e.target.value }))}
                  placeholder="—"
                />
              ))}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field
                label="Contact name"
                value={optDraft.contact_name || ""}
                onChange={(e) => setOptDraft((d) => ({ ...d, contact_name: e.target.value }))}
              />
              <Field
                label="Contact email"
                value={optDraft.contact_email || ""}
                onChange={(e) => setOptDraft((d) => ({ ...d, contact_email: e.target.value }))}
              />
              <Field
                label="Contact phone"
                value={optDraft.contact_phone || ""}
                onChange={(e) => setOptDraft((d) => ({ ...d, contact_phone: e.target.value }))}
              />
            </div>

            <div className="mt-3">
              <Field
                label="Summary"
                value={optDraft.summary || ""}
                onChange={(e) => setOptDraft((d) => ({ ...d, summary: e.target.value }))}
                placeholder="Funds co-living on room-by-room income. No seasoning."
              />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={saveOption}
                disabled={busy || needsOptions}
                className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
                style={{ backgroundColor: GREEN }}
              >
                {editingOpt ? "Save changes" : "Add option"}
              </button>
              {editingOpt && (
                <button
                  onClick={() => {
                    setEditingOpt(null);
                    setOptDraft({});
                  }}
                  className="text-[11px] text-neutral-500 underline underline-offset-2"
                >
                  Cancel
                </button>
              )}
              {optError ? (
                <span className="text-[12px] font-semibold" style={{ color: "#B91C1C" }}>
                  {optError}
                </span>
              ) : (
                <span className="text-[11px] text-neutral-500">
                  Contact details are shown to buyers — only list people happy
                  to be approached.
                </span>
              )}
            </div>
          </div>

          {options && options.length === 0 && !needsOptions && (
            <div className="rounded border border-neutral-200 bg-white px-4 py-6 text-[13px] text-neutral-600">
              No options yet. Until one exists, buyers see a placeholder instead
              of lender introductions.
            </div>
          )}

          {(options || []).map((o) => (
            <div key={o.id} className="mb-3 rounded border border-neutral-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-bold text-neutral-900">{o.label}</span>
                {o.lender_name && (
                  <span className="text-[12px] text-neutral-500">{o.lender_name}</span>
                )}
                <Pill tone={o.deals ? "neutral" : "good"}>
                  {o.deals ? o.deals.address_line : "All properties"}
                </Pill>
                {!o.active && <Pill tone="off">Inactive</Pill>}

                <button
                  onClick={() => {
                    setEditingOpt(o.id);
                    setOptDraft({
                      label: o.label || "",
                      lender_name: o.lender_name || "",
                      loan_type: o.loan_type || "",
                      slug: o.deals?.slug || "",
                      max_ltv_pct: o.max_ltv_pct ?? "",
                      rate_from_pct: o.rate_from_pct ?? "",
                      term_months: o.term_months ?? "",
                      min_dscr: o.min_dscr ?? "",
                      points: o.points ?? "",
                      contact_name: o.contact_name || "",
                      contact_email: o.contact_email || "",
                      contact_phone: o.contact_phone || "",
                      summary: o.summary || "",
                    });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="ml-auto text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteOption(o.id)}
                  className="text-[11px] text-neutral-500 underline underline-offset-2 hover:text-red-700"
                >
                  Remove
                </button>
              </div>

              <div className="mt-1 text-[12px] text-neutral-700">
                {[
                  o.max_ltv_pct != null && `${o.max_ltv_pct}% LTV`,
                  o.rate_from_pct != null && `from ${o.rate_from_pct}%`,
                  o.term_months != null && `${o.term_months} mo`,
                  o.min_dscr != null && `DSCR ${o.min_dscr}+`,
                  o.points != null && `${o.points} pts`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "No terms set"}
              </div>

              {o.summary && (
                <p className="mt-1 text-[12px] text-neutral-600">{o.summary}</p>
              )}
              {(o.contact_name || o.contact_email) && (
                <div className="mt-1 text-[11px] text-neutral-500">
                  {o.contact_name}
                  {o.contact_email ? ` · ${o.contact_email}` : ""}
                  {o.contact_phone ? ` · ${o.contact_phone}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---------------- interest ---------------- */}
      {tab === "interest" && (
        <div className="mt-5">
          {!interest && <div className="text-[13px] text-neutral-500">Loading…</div>}
          {interest && interest.length === 0 && (
            <div className="rounded border border-neutral-200 bg-white px-4 py-6 text-[13px] text-neutral-600">
              Nothing yet. This fills as buyers raise their hand in the portal.
            </div>
          )}

          {(interest || []).map((i) => (
            <div
              key={i.id}
              className="mb-3 rounded border bg-white px-4 py-3"
              style={{ borderColor: i.status === "new" ? GREEN : "#E5E7EB" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-bold text-neutral-900">
                  {i.buyer_orgs?.name}
                </span>
                <Pill tone={i.kind === "offer" ? "good" : i.kind === "passed" ? "off" : "neutral"}>
                  {i.kind === "offer" ? "Offer" : i.kind}
                </Pill>
                {i.status !== "new" && <Pill tone="neutral">{i.status}</Pill>}
                <span className="ml-auto text-[11px] text-neutral-400">
                  {new Date(i.created_at).toLocaleString()}
                </span>
              </div>

              <div className="mt-1 text-[13px] text-neutral-700">
                <a
                  href={`/proforma-club/${i.deals?.slug}`}
                  className="font-semibold underline underline-offset-2"
                >
                  {i.deals?.address_line}
                </a>
                {i.deals?.city ? `, ${i.deals.city}` : ""}
                {i.offer_price ? (
                  <>
                    {" · offered "}
                    <strong className="tabular-nums">{usd(i.offer_price)}</strong>
                    {i.deals?.list_price ? (
                      <span className="text-neutral-500">
                        {" "}
                        against {usd(i.deals.list_price)} list
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>

              <div className="text-[11px] text-neutral-500">
                {i.buyer_users?.name || i.buyer_users?.email}
              </div>

              {i.note && (
                <p className="mt-2 border-l-2 border-neutral-300 pl-3 text-[12px] text-neutral-700">
                  {i.note}
                </p>
              )}

              <div className="mt-2 flex gap-3">
                {["reviewing", "accepted", "declined"].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatus(i.id, st)}
                    disabled={busy || i.status === st}
                    className="text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-900 disabled:no-underline disabled:opacity-40"
                  >
                    Mark {st}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
