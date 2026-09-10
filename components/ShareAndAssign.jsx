"use client";

// ============================================================
// Share a deal, and assign it to a buying firm.
//
// Both actions used to live only on the pro forma editor, which meant
// sharing a house required opening a sheet first. They belong wherever
// you happen to be working: the deal's Record tab, and the Buyers page
// when you're looking at a firm rather than a house.
//
// The editor froze whatever model was on screen into the link. Here
// there is no on-screen model, so the link carries none — and the
// share route falls back to the deal's saved assumptions, then to the
// record. That is the better default: a link built from the deal
// rather than from whatever someone had adjusted in a tab.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "../lib/queries";

const GREEN = "#00A651";

async function token() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || "";
}

export default function ShareAndAssign({ slug, dealLabel, listPrice, compact = false }) {
  const [orgs, setOrgs] = useState([]);
  const [assignOrg, setAssignOrg] = useState("");
  const [assignStatus, setAssignStatus] = useState("offered");
  const [assignMsg, setAssignMsg] = useState(null);
  const [assigning, setAssigning] = useState(false);

  const [recipient, setRecipient] = useState("");
  const [label, setLabel] = useState("");
  const [expiresDays, setExpiresDays] = useState("");
  const [allowAdjust, setAllowAdjust] = useState(true);
  const [shareUrl, setShareUrl] = useState(null);
  const [shareError, setShareError] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase
      .from("buyer_orgs")
      .select("id, name, active")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setOrgs(data || []));
  }, []);

  async function assign() {
    setAssignMsg(null);
    setAssigning(true);
    try {
      const res = await fetch("/api/buyer/admin/assign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await token()}`,
        },
        body: JSON.stringify({ slug, org_id: assignOrg, status: assignStatus }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Couldn't assign.");
      setAssignMsg(`Assigned to ${j.assignment?.buyer_orgs?.name || "buyer"}.`);
    } catch (e) {
      setAssignMsg(e.message);
    } finally {
      setAssigning(false);
    }
  }

  async function createShareLink() {
    setSharing(true);
    setShareError(null);
    setCopied(false);
    try {
      // Checked here as well as server-side: a link with no price on it
      // shows a buyer a sheet with a blank where the number goes, and
      // the failure is much clearer before the link exists than after.
      if (!Number(listPrice)) {
        throw new Error("Set a list price on this deal before sharing it.");
      }
      const res = await fetch("/api/club-share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await token()}`,
        },
        body: JSON.stringify({
          slug,
          scenario: "glbm",
          hold_years: 10,
          recipient: recipient || null,
          label: label || null,
          expires_days: expiresDays ? Number(expiresDays) : null,
          allow_adjust: allowAdjust,
          inputs: null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Couldn't create the link.");
      setShareUrl(`${window.location.origin}/s/${j.token}`);
    } catch (e) {
      setShareError(e.message);
    } finally {
      setSharing(false);
    }
  }

  const field =
    "w-full rounded border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-neutral-500";

  return (
    <div className={compact ? "" : "rounded border border-neutral-200 bg-white p-4"}>
      {!compact && (
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
          Share &amp; assign{dealLabel ? ` — ${dealLabel}` : ""}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {/* ---------- assign ---------- */}
        <div>
          <div className="text-[12px] font-bold text-neutral-900">Assign to a buyer</div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-neutral-600">
            An assigned firm can see this deal in their portal whatever its
            status. Exclusive or reserved also hides it from everyone else.
          </p>

          <div className="mt-2 space-y-2">
            <select
              value={assignOrg}
              onChange={(e) => setAssignOrg(e.target.value)}
              className={field}
            >
              <option value="">Choose a firm…</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>

            <select
              value={assignStatus}
              onChange={(e) => setAssignStatus(e.target.value)}
              className={field}
            >
              <option value="offered">Offered — they can see it</option>
              <option value="reserved">Reserved — hidden from others</option>
              <option value="exclusive">Exclusive — hidden from others</option>
              <option value="released">Released — remove the assignment</option>
            </select>

            <button
              onClick={assign}
              disabled={!assignOrg || assigning}
              className="rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-40"
              style={{ backgroundColor: "#111" }}
            >
              {assigning ? "Assigning…" : "Assign"}
            </button>

            {assignMsg && (
              <div className="text-[11.5px] text-neutral-700">{assignMsg}</div>
            )}
          </div>
        </div>

        {/* ---------- share ---------- */}
        <div>
          <div className="text-[12px] font-bold text-neutral-900">Share a link</div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-neutral-600">
            For someone without a portal login. The figures come from this
            deal&rsquo;s saved assumptions, priced at list.
          </p>

          <div className="mt-2 space-y-2">
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Who it's for (optional)"
              className={field}
            />
            <div className="flex gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label (optional)"
                className={field}
              />
              <input
                value={expiresDays}
                onChange={(e) => setExpiresDays(e.target.value)}
                placeholder="Expires (days)"
                inputMode="numeric"
                className="w-32 rounded border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-neutral-500"
              />
            </div>

            <label className="flex items-center gap-1.5 text-[12px] text-neutral-700">
              <input
                type="checkbox"
                checked={allowAdjust}
                onChange={(e) => setAllowAdjust(e.target.checked)}
              />
              Let them stress-test the assumptions
            </label>

            <button
              onClick={createShareLink}
              disabled={sharing}
              className="rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-40"
              style={{ backgroundColor: GREEN }}
            >
              {sharing ? "Creating…" : "Create link"}
            </button>

            {shareError && (
              <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11.5px] text-red-900">
                {shareError}
              </div>
            )}

            {shareUrl && (
              <div className="rounded border border-neutral-200 bg-neutral-50 px-2 py-2">
                <div className="break-all font-mono text-[11px] text-neutral-800">
                  {shareUrl}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(shareUrl);
                    setCopied(true);
                  }}
                  className="mt-1 text-[11px] font-semibold underline underline-offset-2"
                  style={{ color: GREEN }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
