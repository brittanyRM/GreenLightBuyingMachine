"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import PipelineBoard from "../../components/PipelineBoard";
import { listContacts, listOpenTasks, getStalled, completeTask } from "../../lib/crm";
import { usd } from "../../lib/proforma";

const GREEN = "#00A651";

const TABS = [
  { id: "pipeline", label: "Pipeline" },
  { id: "contacts", label: "Contacts" },
  { id: "tasks", label: "Tasks" },
];

export default function CrmPage() {
  const [tab, setTab] = useState("pipeline");
  const [contacts, setContacts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [stalled, setStalled] = useState([]);

  async function load() {
    const [c, t, s] = await Promise.all([
      listContacts().catch(() => []),
      listOpenTasks().catch(() => []),
      getStalled().catch(() => []),
    ]);
    setContacts(c);
    setTasks(t);
    setStalled(s);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen font-sans">
      <div className="bg-neutral-950">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-5 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GREEN }}>
              Green Light Buying Machine
            </div>
            <h1 className="text-2xl font-bold text-white">CRM</h1>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 px-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${
                tab === t.id ? "text-white" : "text-neutral-500 hover:text-neutral-300"
              }`}
              style={tab === t.id ? { borderBottom: `2px solid ${GREEN}` } : {}}
            >
              {t.label}
              {t.id === "tasks" && tasks.length > 0 && (
                <span className="ml-1.5 text-neutral-400">{tasks.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {stalled.length > 0 && tab === "pipeline" && (
        <div className="bg-amber-50 px-5 py-2">
          <div className="mx-auto max-w-6xl text-[11px] text-amber-900">
            {stalled.length} card{stalled.length > 1 ? "s have" : " has"} sat in the same stage a
            week or more — longest is {stalled[0].full_name} on {stalled[0].address_line} at{" "}
            {stalled[0].days_in_stage} days.
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-5 py-5">
        {tab === "pipeline" && <PipelineBoard />}

        {tab === "contacts" && (
          <div className="divide-y divide-neutral-200 bg-white shadow-sm">
            {contacts.length === 0 && (
              <div className="p-8 text-center text-sm text-neutral-500">
                No contacts yet. Add buyers in Settings.
              </div>
            )}
            {contacts.map((c) => (
              <Link
                key={c.id}
                href={`/crm/${c.id}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-neutral-50"
              >
                <div className="flex-1">
                  <div className="text-sm font-bold text-neutral-900">{c.full_name}</div>
                  <div className="text-[11px] text-neutral-500">
                    {c.email}
                    {c.entity_name ? ` · ${c.entity_name}` : ""}
                  </div>
                </div>
                <div className="hidden text-right sm:block">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-400">Shown</div>
                  <div className="text-sm font-semibold tabular-nums">{c.deals_shown}</div>
                </div>
                <div className="hidden text-right sm:block">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-400">Bought</div>
                  <div className="text-sm font-semibold tabular-nums" style={{ color: GREEN }}>
                    {c.deals_purchased}
                  </div>
                </div>
                <div className="w-24 text-right">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-400">
                    Last touch
                  </div>
                  <div
                    className={`text-[12px] ${
                      c.days_since_contact > 30 ? "font-bold text-amber-700" : "text-neutral-600"
                    }`}
                  >
                    {c.days_since_contact == null ? "never" : `${c.days_since_contact}d`}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {tab === "tasks" && (
          <div className="divide-y divide-neutral-200 bg-white shadow-sm">
            {tasks.length === 0 && (
              <div className="p-8 text-center text-sm text-neutral-500">Nothing open.</div>
            )}
            {tasks.map((t) => {
              const overdue = t.due_date && new Date(t.due_date) < new Date();
              return (
                <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                  <button
                    onClick={async () => {
                      await completeTask(t.id);
                      load();
                    }}
                    className="mt-1 h-4 w-4 shrink-0 rounded-sm border border-neutral-400 hover:bg-neutral-200"
                    aria-label="Complete task"
                  />
                  <div className="flex-1">
                    <div className="text-[13px] text-neutral-900">{t.title}</div>
                    <div className="text-[11px] text-neutral-500">
                      {t.deal_contacts?.full_name}
                      {t.deals ? ` · ${t.deals.address_line}` : ""}
                    </div>
                  </div>
                  {t.due_date && (
                    <div className={`text-[11px] ${overdue ? "font-bold text-red-700" : "text-neutral-500"}`}>
                      {new Date(t.due_date + "T12:00:00").toLocaleDateString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
