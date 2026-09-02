"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  getContact,
  logActivity,
  createTask,
  completeTask,
  updateContact,
  ACTIVITY_ICONS,
  STAGES,
} from "../lib/crm";
import { usd } from "../lib/proforma";

const GREEN = "#00A651";

const LIFECYCLES = ["prospect", "qualified", "active_buyer", "repeat_buyer", "dormant", "lost"];

function timeAgo(ts) {
  if (!ts) return "—";
  const days = Math.floor((Date.now() - new Date(ts)) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function ContactDetail({ contactId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [task, setTask] = useState({ title: "", due_date: "" });

  async function load() {
    try {
      setData(await getContact(contactId));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, [contactId]);

  if (error) return <div className="p-8 font-sans text-sm text-red-700">{error}</div>;
  if (!data) return <div className="p-8 font-sans text-sm text-neutral-500">Loading…</div>;

  const { contact, activities, tasks, interests } = data;
  const openTasks = tasks.filter((t) => !t.completed_at);

  async function addNote() {
    if (!note.trim()) return;
    await logActivity({
      contactId,
      type: noteType,
      title: noteType === "note" ? "Note" : noteType === "call" ? "Call" : "Meeting",
      detail: note.trim(),
    });
    setNote("");
    load();
  }

  async function addTask() {
    if (!task.title.trim()) return;
    await createTask({ contactId, title: task.title, dueDate: task.due_date || null });
    setTask({ title: "", due_date: "" });
    load();
  }

  return (
    <div className="min-h-screen font-sans">
      {/* Header */}
      <div className="bg-neutral-950 px-5 py-5">
        <div className="mx-auto max-w-4xl">
          <Link href="/crm" className="text-[11px] text-neutral-500 hover:text-neutral-300">
            ← Pipeline
          </Link>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{contact.full_name}</h1>
              <div className="text-sm text-neutral-400">
                {contact.email}
                {contact.entity_name ? ` · ${contact.entity_name}` : ""}
                {contact.phone ? ` · ${contact.phone}` : ""}
              </div>
            </div>
            <div className="flex gap-5 text-right">
              <div>
                <div className="text-[9px] uppercase tracking-wider text-neutral-500">Purchased</div>
                <div className="text-lg font-bold tabular-nums text-white">
                  {contact.deals_purchased}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-neutral-500">Volume</div>
                <div className="text-lg font-bold tabular-nums" style={{ color: GREEN }}>
                  {usd(contact.total_purchased || 0)}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-neutral-500">
                  Last contact
                </div>
                <div className="text-lg font-bold text-white">
                  {timeAgo(contact.last_contacted_at)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {LIFECYCLES.map((l) => (
              <button
                key={l}
                onClick={async () => {
                  await updateContact(contactId, { lifecycle: l });
                  load();
                }}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                  contact.lifecycle === l ? "text-white" : "bg-neutral-800 text-neutral-400"
                }`}
                style={contact.lifecycle === l ? { backgroundColor: GREEN } : {}}
              >
                {l.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-4xl gap-6 px-5 py-6 md:grid-cols-[1fr_280px]">
        {/* Timeline */}
        <div>
          <div className="mb-3 bg-white p-3 shadow-sm">
            <div className="mb-2 flex gap-1">
              {["note", "call", "meeting"].map((t) => (
                <button
                  key={t}
                  onClick={() => setNoteType(t)}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                    noteType === t ? "text-white" : "bg-neutral-100 text-neutral-600"
                  }`}
                  style={noteType === t ? { backgroundColor: GREEN } : {}}
                >
                  {t}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={
                noteType === "call"
                  ? "What came out of the call?"
                  : noteType === "meeting"
                  ? "What was covered?"
                  : "Anything worth remembering."
              }
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-neutral-900"
            />
            <button
              onClick={addNote}
              disabled={!note.trim()}
              className="mt-2 rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-30"
              style={{ backgroundColor: GREEN }}
            >
              Log it
            </button>
          </div>

          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-900">
            Timeline
          </h2>
          {activities.length === 0 ? (
            <p className="text-[12px] text-neutral-500">
              Nothing yet. Sending a deal starts the record automatically.
            </p>
          ) : (
            <div className="space-y-0">
              {activities.map((a) => (
                <div key={a.id} className="flex gap-3 border-l border-neutral-200 pb-3 pl-3">
                  <div
                    className="-ml-[22px] mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] text-white"
                    style={{ backgroundColor: a.is_automatic ? "#9CA3AF" : GREEN }}
                    title={a.is_automatic ? "Logged automatically" : "Logged by hand"}
                  >
                    {ACTIVITY_ICONS[a.activity_type] || "·"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-semibold text-neutral-900">{a.title}</span>
                      <span className="shrink-0 text-[10px] text-neutral-400">
                        {timeAgo(a.occurred_at)}
                      </span>
                    </div>
                    {a.detail && (
                      <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-snug text-neutral-600">
                        {a.detail}
                      </p>
                    )}
                    {a.deals && (
                      <Link
                        href={`/deals/${a.deals.slug}`}
                        className="mt-0.5 inline-block text-[10px] text-neutral-500 hover:underline"
                      >
                        {a.deals.address_line}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]">
              Deals ({interests.length})
            </h2>
            {interests.length === 0 ? (
              <p className="text-[11px] text-neutral-500">No deals sent yet.</p>
            ) : (
              <div className="space-y-1.5">
                {interests.map((i) => (
                  <Link
                    key={i.id}
                    href={`/deals/${i.slug}`}
                    className="block rounded border border-neutral-200 bg-white p-2 hover:border-neutral-400"
                  >
                    <div className="text-[12px] font-semibold text-neutral-900">
                      {i.address_line}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase" style={{ color: GREEN }}>
                        {STAGES.find((s) => s.id === i.stage)?.label || i.stage}
                      </span>
                      <span className="text-[11px] tabular-nums text-neutral-600">
                        {usd(i.offer_amount || i.deal_price || 0)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]">
              Tasks ({openTasks.length})
            </h2>
            <div className="mb-2 space-y-1">
              <input
                value={task.title}
                onChange={(e) => setTask({ ...task, title: e.target.value })}
                placeholder="Follow up on…"
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-[12px] outline-none focus:border-neutral-900"
              />
              <div className="flex gap-1">
                <input
                  type="date"
                  value={task.due_date}
                  onChange={(e) => setTask({ ...task, due_date: e.target.value })}
                  className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-[12px] outline-none"
                />
                <button
                  onClick={addTask}
                  disabled={!task.title.trim()}
                  className="rounded px-3 text-[11px] font-bold uppercase text-white disabled:opacity-30"
                  style={{ backgroundColor: GREEN }}
                >
                  Add
                </button>
              </div>
            </div>
            {openTasks.map((t) => {
              const overdue = t.due_date && new Date(t.due_date) < new Date();
              return (
                <div key={t.id} className="flex items-start gap-2 border-b border-neutral-200 py-1.5">
                  <button
                    onClick={async () => {
                      await completeTask(t.id);
                      load();
                    }}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border border-neutral-400 hover:bg-neutral-200"
                    aria-label="Complete task"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-neutral-800">{t.title}</div>
                    {t.due_date && (
                      <div className={`text-[10px] ${overdue ? "font-bold text-red-700" : "text-neutral-400"}`}>
                        {overdue ? "Overdue " : "Due "}
                        {new Date(t.due_date + "T12:00:00").toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
