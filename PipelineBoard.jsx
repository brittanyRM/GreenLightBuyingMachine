"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getPipeline, moveCard, passOnDeal, STAGES } from "../lib/crm";
import { usd } from "../lib/proforma";

const GREEN = "#00A651";

// Days in a column before a card starts nagging. Later stages get
// less rope — an offer sitting untouched for a week is a problem,
// a fresh send isn't.
const STALE_DAYS = {
  sent: 5,
  viewed: 4,
  reviewing: 5,
  call_scheduled: 3,
  offer: 3,
  committed: 7,
  closed: 9999,
};

function Card({ card, onDragStart, onPass }) {
  const stale = card.days_in_stage >= (STALE_DAYS[card.stage] ?? 7);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card)}
      className="mb-2 cursor-grab rounded border border-neutral-200 bg-white p-2.5 shadow-sm active:cursor-grabbing"
      style={stale ? { borderLeftWidth: 3, borderLeftColor: "#D97706" } : {}}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/crm/${card.contact_id}`}
          className="text-[12px] font-bold text-neutral-900 hover:underline"
        >
          {card.full_name}
        </Link>
        {card.deals_purchased > 0 && (
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase text-white"
            style={{ backgroundColor: GREEN }}
            title={`${card.deals_purchased} purchased`}
          >
            {card.deals_purchased}×
          </span>
        )}
      </div>

      <Link
        href={`/deals/${card.slug}`}
        className="mt-0.5 block text-[11px] text-neutral-600 hover:underline"
      >
        {card.address_line}
      </Link>

      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold tabular-nums text-neutral-800">
          {card.offer_amount ? usd(card.offer_amount) : usd(card.deal_price || 0)}
          {card.offer_amount && (
            <span className="ml-1 text-[9px] font-normal uppercase text-neutral-400">offer</span>
          )}
        </span>
        <span className={`text-[10px] ${stale ? "font-bold text-amber-700" : "text-neutral-400"}`}>
          {card.days_in_stage}d
        </span>
      </div>

      {card.stage !== "closed" && (
        <button
          onClick={() => onPass(card)}
          className="mt-1.5 text-[10px] text-neutral-400 hover:text-red-700"
        >
          Passed
        </button>
      )}
    </div>
  );
}

export default function PipelineBoard() {
  const [cards, setCards] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [overStage, setOverStage] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      setCards(await getPipeline());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s.id, []]));
    (cards || []).forEach((c) => {
      if (map[c.stage]) map[c.stage].push(c);
    });
    return map;
  }, [cards]);

  const totals = useMemo(() => {
    const active = (cards || []).filter((c) => !["closed"].includes(c.stage));
    return {
      count: active.length,
      value: active.reduce((s, c) => s + Number(c.offer_amount || c.deal_price || 0), 0),
      closed: (cards || []).filter((c) => c.stage === "closed"),
    };
  }, [cards]);

  async function handleDrop(stage) {
    if (!dragging || dragging.stage === stage) {
      setDragging(null);
      setOverStage(null);
      return;
    }
    // Move it on screen first — the board should feel immediate.
    setCards((cs) => cs.map((c) => (c.id === dragging.id ? { ...c, stage, days_in_stage: 0 } : c)));
    setOverStage(null);
    try {
      await moveCard(dragging.id, stage);
      load();
    } catch (e) {
      setError(e.message);
      load();
    }
    setDragging(null);
  }

  async function handlePass(card) {
    const reason = window.prompt(`Why did ${card.full_name} pass on ${card.address_line}?`);
    if (reason === null) return;
    await passOnDeal(card.id, reason);
    load();
  }

  if (error) return <div className="p-8 text-sm text-red-700">{error}</div>;
  if (!cards) return <div className="p-8 text-sm text-neutral-500">Loading pipeline…</div>;

  return (
    <div className="font-sans">
      <div className="mb-3 flex flex-wrap items-center gap-5 px-1">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">In play</div>
          <div className="text-lg font-bold tabular-nums">
            {totals.count} <span className="text-sm font-normal text-neutral-500">deals</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">Pipeline value</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: GREEN }}>
            {usd(totals.value)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">Closed</div>
          <div className="text-lg font-bold tabular-nums">{totals.closed.length}</div>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const list = byStage[stage.id] || [];
          const value = list.reduce(
            (s, c) => s + Number(c.offer_amount || c.deal_price || 0),
            0
          );
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage.id);
              }}
              onDragLeave={() => setOverStage(null)}
              onDrop={() => handleDrop(stage.id)}
              className={`w-56 shrink-0 rounded bg-neutral-200/60 p-2 transition ${
                overStage === stage.id ? "bg-neutral-300 ring-2" : ""
              }`}
              style={overStage === stage.id ? { ringColor: GREEN } : {}}
            >
              <div className="mb-2 px-0.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-700">
                    {stage.label}
                  </span>
                  <span className="text-[11px] font-bold tabular-nums text-neutral-500">
                    {list.length}
                  </span>
                </div>
                <div className="text-[10px] tabular-nums text-neutral-500">
                  {value > 0 ? usd(value) : stage.hint}
                </div>
              </div>

              {list.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  onDragStart={(e, c) => setDragging(c)}
                  onPass={handlePass}
                />
              ))}

              {list.length === 0 && (
                <div className="rounded border border-dashed border-neutral-300 px-2 py-6 text-center text-[10px] text-neutral-400">
                  {stage.hint}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
