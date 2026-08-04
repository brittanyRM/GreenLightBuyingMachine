"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { supabase, upsertMarket } from "../../lib/queries";

const GREEN = "#00A651";

export default function SettingsPage() {
  const params = useSearchParams();
  const connected = params.get("connected");
  const error = params.get("error");

  const [accounts, setAccounts] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [newBuyer, setNewBuyer] = useState({ full_name: "", email: "", phone: "", entity_name: "" });
  const [msg, setMsg] = useState(null);

  async function load() {
    const [a, b, m] = await Promise.all([
      // Refresh tokens never reach the browser — only these columns are selected.
      supabase.from("email_accounts").select("id, email, display_name, is_default, last_error, connected_at"),
      supabase.from("deal_contacts").select("*").order("full_name"),
      supabase.from("padsplit_market").select("*").order("zip"),
    ]);
    setAccounts(a.data || []);
    setBuyers(b.data || []);
    setMarkets(m.data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function addBuyer() {
    if (!newBuyer.full_name || !newBuyer.email) return;
    const { error } = await supabase.from("deal_contacts").insert(newBuyer);
    if (error) return setMsg({ ok: false, text: error.message });
    setNewBuyer({ full_name: "", email: "", phone: "", entity_name: "" });
    setMsg({ ok: true, text: "Buyer added." });
    load();
  }

  async function toggleBuyer(b) {
    await supabase
      .from("deal_contacts")
      .update({ buyer_status: b.buyer_status === "active" ? "paused" : "active" })
      .eq("id", b.id);
    load();
  }

  return (
    <div className="min-h-screen font-sans">
      <div className="bg-neutral-950 px-5 py-5">
        <div className="mx-auto max-w-3xl">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GREEN }}>
            Green Light Buying Machine
          </div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-5 py-6">
        {connected && (
          <div className="rounded border-l-4 border-green-600 bg-green-50 px-4 py-3 text-[13px] text-green-900">
            Connected {connected}. Deal emails will send from this mailbox.
          </div>
        )}
        {error && (
          <div className="rounded border-l-4 border-red-600 bg-red-50 px-4 py-3 text-[13px] text-red-900">
            {error}
          </div>
        )}

        {/* Google Workspace */}
        <section>
          <h2 className="mb-3 border-b-2 border-neutral-900 pb-1 text-[12px] font-bold uppercase tracking-[0.12em]">
            Sending mailbox
          </h2>
          {accounts.length === 0 ? (
            <div className="rounded border border-dashed border-neutral-300 bg-white p-6 text-center">
              <p className="text-sm font-semibold text-neutral-700">
                No Google Workspace account connected
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-neutral-500">
                Deal emails send from your real mailbox, so replies thread normally and everything
                lands in Sent.
              </p>
              <a
                href="/api/auth/google"
                className="mt-4 inline-block rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: GREEN }}
              >
                Connect Google Workspace
              </a>
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 bg-white shadow-sm">
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{a.email}</div>
                    <div className="text-[11px] text-neutral-500">
                      {a.display_name}
                      {a.is_default && (
                        <span className="ml-2 font-bold" style={{ color: GREEN }}>
                          default
                        </span>
                      )}
                    </div>
                    {a.last_error && (
                      <div className="mt-1 text-[11px] text-red-700">
                        {a.last_error} — reconnect below.
                      </div>
                    )}
                  </div>
                  <a
                    href="/api/auth/google"
                    className="text-[11px] font-semibold text-neutral-600 underline underline-offset-2"
                  >
                    Reconnect
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Buyers */}
        <section>
          <h2 className="mb-3 border-b-2 border-neutral-900 pb-1 text-[12px] font-bold uppercase tracking-[0.12em]">
            Buyer list
          </h2>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["full_name", "Name"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["entity_name", "Entity"],
            ].map(([k, label]) => (
              <input
                key={k}
                value={newBuyer[k]}
                onChange={(e) => setNewBuyer({ ...newBuyer, [k]: e.target.value })}
                placeholder={label}
                className="rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
              />
            ))}
          </div>
          <button
            onClick={addBuyer}
            className="mb-3 rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white"
            style={{ backgroundColor: GREEN }}
          >
            Add buyer
          </button>
          {msg && (
            <span className={`ml-3 text-[12px] ${msg.ok ? "text-neutral-600" : "text-red-700"}`}>
              {msg.text}
            </span>
          )}

          {buyers.length > 0 && (
            <div className="divide-y divide-neutral-200 bg-white shadow-sm">
              {buyers.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{b.full_name}</div>
                    <div className="text-[11px] text-neutral-500">
                      {b.email}
                      {b.entity_name ? ` · ${b.entity_name}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleBuyer(b)}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      b.buyer_status === "active"
                        ? "text-white"
                        : "bg-neutral-200 text-neutral-600"
                    }`}
                    style={b.buyer_status === "active" ? { backgroundColor: GREEN } : {}}
                  >
                    {b.buyer_status}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Markets */}
        <section>
          <h2 className="mb-3 border-b-2 border-neutral-900 pb-1 text-[12px] font-bold uppercase tracking-[0.12em]">
            PadSplit markets
          </h2>
          {markets.length === 0 ? (
            <p className="text-[12px] text-neutral-500">
              None saved. Market data is entered per deal on the Record tab.
            </p>
          ) : (
            <div className="divide-y divide-neutral-200 bg-white shadow-sm">
              {markets.map((m) => {
                const age = Math.floor((Date.now() - new Date(m.fetched_at)) / 86400000);
                return (
                  <div key={m.zip} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-16 text-sm font-bold tabular-nums">{m.zip}</div>
                    <div className="flex-1 text-[11px] text-neutral-600">
                      {m.active_units} units · ${m.shared_weekly}/${m.private_weekly} per wk ·{" "}
                      {Math.round(m.avg_occupancy * 100)}% occupancy
                    </div>
                    <div
                      className={`text-[11px] ${age > 60 ? "font-bold text-amber-700" : "text-neutral-400"}`}
                    >
                      {age}d old
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
