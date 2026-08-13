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
import { usd } from "../../../lib/proformaClub";
import { describeBuyBox, parseList } from "../../../lib/buyBox";

const GREEN = "#00A651";

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

  const [newOrg, setNewOrg] = useState("");
  const [newUser, setNewUser] = useState({});
  const [link, setLink] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [o, i] = await Promise.all([
        apiFetch("/api/buyer/admin/orgs"),
        apiFetch("/api/buyer/admin/interest"),
      ]);
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
      await apiFetch("/api/buyer/admin/orgs", { method: "POST", body: { name: newOrg.trim() } });
      setNewOrg("");
    });

  const addUser = (orgId) =>
    run(async () => {
      const u = newUser[orgId] || {};
      if (!u.email) throw new Error("An email address is required.");
      await apiFetch("/api/buyer/admin/users", {
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
    run(() => apiFetch("/api/buyer/admin/users", { method: "PATCH", body: { id, ...patch } }));

  const patchOrg = (id, patch) =>
    run(() => apiFetch("/api/buyer/admin/orgs", { method: "PATCH", body: { id, ...patch } }));

  const makeLink = (userId) =>
    run(async () => {
      const res = await apiFetch("/api/buyer/admin/magic", {
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
      await apiFetch("/api/buyer/admin/buybox", {
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
          cities: parseList(d.cities),
          zips: parseList(d.zips),
          states: parseList(d.states),
          notes: d.notes || null,
        },
      });
      setBoxOpen((s2) => ({ ...s2, [orgId]: false }));
    });

  const setStatus = (id, status) =>
    run(() => apiFetch("/api/buyer/admin/interest", { method: "PATCH", body: { id, status } }));

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
                </div>
              </div>
            );
          })}
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
