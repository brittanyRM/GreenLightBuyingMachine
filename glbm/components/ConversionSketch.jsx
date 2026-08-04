"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { uploadSketch, saveRooms } from "../lib/queries";
import { usd } from "../lib/proforma";

// ============================================================
// Conversion Sketch — draw the new layout on the county
// assessor sketch. Writes deal_rooms; the pro forma, flyer,
// and buyer email all read from what's drawn here.
// ============================================================

const GREEN = "#00A651";

const TYPES = {
  shared: { label: "Bedroom — shared", fill: "rgba(31,41,55,0.55)", stroke: "#1F2937" },
  ensuite: { label: "Bedroom — ensuite", fill: "rgba(0,166,81,0.45)", stroke: GREEN },
  bath: { label: "Bathroom", fill: "rgba(37,99,235,0.35)", stroke: "#2563EB" },
  common: { label: "Common", fill: "rgba(120,113,108,0.28)", stroke: "#78716C" },
};

const uid = () => Math.random().toString(36).slice(2, 9);

export default function ConversionSketch({
  deal,
  initialRooms = [],
  market = null,
  onSaved,
}) {
  const [image, setImage] = useState(deal?.floor_plan_url || null);
  const [rooms, setRooms] = useState(() =>
    initialRooms.map((r) => ({
      id: r.id || uid(),
      type: r.room_type,
      number: r.room_number,
      label: r.label,
      bathLabel: r.bath_label || "",
      rateOverride: r.weekly_rate,
      note: r.premium_note || "",
      // Stored coords are the box center; boxes get a default size on reload.
      x: Math.max(0, (r.plan_x ?? 50) - 6),
      y: Math.max(0, (r.plan_y ?? 50) - 5),
      w: 12,
      h: 10,
    }))
  );
  const [drawType, setDrawType] = useState("shared");
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const [beforeBeds, setBeforeBeds] = useState(3);
  const [beforeBaths, setBeforeBaths] = useState(2);
  const [sharedRate, setSharedRate] = useState(market?.shared_weekly || 195);
  const [ensuiteRate, setEnsuiteRate] = useState(market?.private_weekly || 291);

  const stageRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    if (market) {
      setSharedRate(market.shared_weekly);
      setEnsuiteRate(market.private_weekly);
    }
  }, [market]);

  const counts = useMemo(() => {
    const shared = rooms.filter((r) => r.type === "shared");
    const ensuite = rooms.filter((r) => r.type === "ensuite");
    const baths = rooms.filter((r) => r.type === "bath");
    const weekly =
      shared.reduce((s, r) => s + (r.rateOverride ?? sharedRate), 0) +
      ensuite.reduce((s, r) => s + (r.rateOverride ?? ensuiteRate), 0);
    return {
      beds: shared.length + ensuite.length,
      shared: shared.length,
      ensuite: ensuite.length,
      baths: baths.length + ensuite.length,
      weekly,
    };
  }, [rooms, sharedRate, ensuiteRate]);

  async function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (deal?.id) {
      try {
        const url = await uploadSketch(deal.id, file);
        setImage(url);
        return;
      } catch (err) {
        setMsg({ ok: false, text: `Upload failed: ${err.message}` });
      }
    }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(file);
  }

  function pointPct(e) {
    const rect = stageRef.current.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function onPointerDown(e) {
    if (!image || e.target.dataset.room) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointPct(e);
    startRef.current = p;
    setSelected(null);
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onPointerMove(e) {
    if (!startRef.current) return;
    const p = pointPct(e);
    const s = startRef.current;
    setDraft({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  }

  function onPointerUp() {
    const dr = draft;
    startRef.current = null;
    setDraft(null);
    if (!dr || dr.w < 2 || dr.h < 2) return;
    const isBed = drawType === "shared" || drawType === "ensuite";
    const bedNum = rooms.filter((r) => r.type === "shared" || r.type === "ensuite").length + 1;
    const bathNum = rooms.filter((r) => r.type === "bath").length + 1;
    const room = {
      id: uid(),
      type: drawType,
      number: isBed ? bedNum : drawType === "bath" ? bathNum : null,
      label: isBed ? `Bedroom ${bedNum}` : drawType === "bath" ? `Bath ${bathNum}` : "Common",
      bathLabel: drawType === "ensuite" ? `Ensuite ${bedNum}` : "",
      rateOverride: null,
      note: "",
      ...dr,
    };
    setRooms((r) => [...r, room]);
    setSelected(room.id);
    setDirty(true);
  }

  const update = (id, patch) => {
    setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const remove = (id) => {
    setRooms((rs) => rs.filter((r) => r.id !== id));
    setSelected(null);
    setDirty(true);
  };

  function renumber() {
    let bed = 0;
    let bath = 0;
    setRooms((rs) =>
      rs.map((r) => {
        if (r.type === "shared" || r.type === "ensuite") {
          bed += 1;
          return {
            ...r,
            number: bed,
            label: `Bedroom ${bed}`,
            bathLabel: r.type === "ensuite" ? `Ensuite ${bed}` : "",
          };
        }
        if (r.type === "bath") {
          bath += 1;
          return { ...r, number: bath, label: `Bath ${bath}` };
        }
        return r;
      })
    );
    setDirty(true);
  }

  const dealRooms = rooms
    .filter((r) => r.type !== "common")
    .map((r) => ({
      room_number: r.number,
      label: r.label,
      room_type: r.type,
      bath_label: r.type === "ensuite" ? r.bathLabel : null,
      weekly_rate: r.rateOverride,
      premium_note: r.note || null,
      plan_x: +(r.x + r.w / 2).toFixed(2),
      plan_y: +(r.y + r.h / 2).toFixed(2),
    }));

  async function handleSave() {
    if (!deal?.id) {
      setMsg({ ok: false, text: "Save the deal record first." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await saveRooms(deal.id, dealRooms);
      setDirty(false);
      setMsg({ ok: true, text: `Saved ${counts.beds} bedrooms, ${counts.baths} baths.` });
      onSaved?.(dealRooms);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  }

  const sel = rooms.find((r) => r.id === selected);

  return (
    <div className="p-3 font-sans sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 bg-neutral-950 px-5 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GREEN }}>
              Conversion Sketch
            </div>
            <h1 className="text-lg font-bold text-white">
              {deal?.address_line || "Untitled deal"}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-white">
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wider text-neutral-500">Existing</div>
              <div className="flex items-center gap-1">
                <input type="number" value={beforeBeds} onChange={(e) => setBeforeBeds(+e.target.value || 0)} className="w-8 bg-transparent text-right text-2xl font-bold tabular-nums outline-none" />
                <span className="text-2xl font-bold text-neutral-600">/</span>
                <input type="number" value={beforeBaths} onChange={(e) => setBeforeBaths(+e.target.value || 0)} className="w-8 bg-transparent text-2xl font-bold tabular-nums outline-none" />
              </div>
            </div>
            <div className="text-3xl font-light text-neutral-700">→</div>
            <div>
              <div className="text-[9px] uppercase tracking-wider" style={{ color: GREEN }}>Converted</div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: GREEN }}>
                {counts.beds} / {counts.baths}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5 bg-white p-2 shadow-sm">
              {Object.entries(TYPES).map(([key, t]) => (
                <button
                  key={key}
                  onClick={() => setDrawType(key)}
                  className={`rounded px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    drawType === key ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                  style={drawType === key ? { backgroundColor: t.stroke } : {}}
                >
                  {t.label}
                </button>
              ))}
              <div className="ml-auto flex gap-1.5">
                <button onClick={renumber} className="rounded px-2.5 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100">
                  Renumber
                </button>
                <label className="cursor-pointer rounded px-2.5 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100">
                  Replace sketch
                  <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
                </label>
              </div>
            </div>

            {!image ? (
              <label className="flex h-96 cursor-pointer flex-col items-center justify-center border-2 border-dashed border-neutral-300 bg-white text-center hover:border-neutral-400">
                <div className="text-4xl text-neutral-300">⌂</div>
                <div className="mt-2 text-sm font-semibold text-neutral-700">
                  Drop the county assessor sketch
                </div>
                <div className="mt-1 max-w-xs text-xs text-neutral-500">
                  Then draw the new bedroom layout on top of it.
                </div>
                <span className="mt-4 rounded px-4 py-2 text-xs font-bold text-white" style={{ backgroundColor: GREEN }}>
                  Choose file
                </span>
                <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
              </label>
            ) : (
              <div
                ref={stageRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className="relative touch-none select-none bg-white shadow-sm"
                style={{ cursor: "crosshair" }}
              >
                <img src={image} alt="Assessor sketch" className="pointer-events-none block w-full" />
                {rooms.map((r) => {
                  const t = TYPES[r.type];
                  const isSel = r.id === selected;
                  return (
                    <div
                      key={r.id}
                      data-room="1"
                      onPointerDown={(e) => { e.stopPropagation(); setSelected(r.id); }}
                      className="absolute flex items-center justify-center overflow-hidden"
                      style={{
                        left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`,
                        backgroundColor: t.fill,
                        border: `${isSel ? 3 : 1.5}px solid ${t.stroke}`,
                        cursor: "pointer",
                      }}
                    >
                      <span data-room="1" className="pointer-events-none px-1 text-center text-[10px] font-bold leading-tight text-white drop-shadow">
                        {r.type === "ensuite" ? `${r.label} ✦` : r.label}
                      </span>
                    </div>
                  );
                })}
                {draft && (
                  <div
                    className="absolute border-2 border-dashed"
                    style={{
                      left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.w}%`, height: `${draft.h}%`,
                      borderColor: TYPES[drawType].stroke, backgroundColor: TYPES[drawType].fill,
                    }}
                  />
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="bg-neutral-950 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                Gross scheduled rent
              </div>
              <div className="text-3xl font-bold tabular-nums" style={{ color: GREEN }}>
                {usd((counts.weekly * 52) / 12)}
                <span className="text-sm font-normal text-neutral-500">/mo</span>
              </div>
              <div className="mt-0.5 text-[11px] text-neutral-400">
                {usd(counts.weekly)}/wk · {usd(counts.weekly * 52)}/yr
              </div>
              <div className="mt-3 space-y-2 border-t border-neutral-800 pt-3">
                {[
                  ["shared", counts.shared, sharedRate, setSharedRate, "#A3A3A3"],
                  ["ensuite", counts.ensuite, ensuiteRate, setEnsuiteRate, GREEN],
                ].map(([key, count, rate, setter, color]) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="text-[11px]" style={{ color }}>{count}× {key} @</span>
                    <div className="flex items-center rounded border border-neutral-700 bg-neutral-900 px-1.5">
                      <span className="text-xs text-neutral-500">$</span>
                      <input type="number" value={rate} onChange={(e) => setter(+e.target.value || 0)} className="w-12 bg-transparent py-1 text-right text-xs text-white outline-none" />
                      <span className="text-[10px] text-neutral-500">/wk</span>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="mt-3 w-full rounded py-2 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-30"
                style={{ backgroundColor: GREEN }}
              >
                {saving ? "Saving…" : dirty ? "Save layout" : "Saved"}
              </button>
              {msg && (
                <div className={`mt-2 text-[10px] ${msg.ok ? "text-neutral-400" : "text-red-400"}`}>
                  {msg.text}
                </div>
              )}
            </div>

            {sel ? (
              <div className="bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.12em]">{sel.label}</h2>
                  <button onClick={() => remove(sel.id)} className="text-[11px] font-semibold text-red-700 hover:underline">
                    Delete
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(TYPES).map(([key, t]) => (
                      <button
                        key={key}
                        onClick={() => update(sel.id, { type: key })}
                        className={`rounded px-2 py-1 text-[10px] font-semibold ${sel.type === key ? "text-white" : "bg-neutral-100 text-neutral-600"}`}
                        style={sel.type === key ? { backgroundColor: t.stroke } : {}}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                  <input value={sel.label} onChange={(e) => update(sel.id, { label: e.target.value })} placeholder="Label" className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:border-neutral-900" />
                  {(sel.type === "shared" || sel.type === "ensuite") && (
                    <>
                      <input
                        type="number"
                        value={sel.rateOverride ?? ""}
                        onChange={(e) => update(sel.id, { rateOverride: e.target.value === "" ? null : +e.target.value })}
                        placeholder={`Rate override (default $${sel.type === "ensuite" ? ensuiteRate : sharedRate}/wk)`}
                        className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:border-neutral-900"
                      />
                      <input value={sel.note} onChange={(e) => update(sel.id, { note: e.target.value })} placeholder="Note — corner room, private entry…" className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:border-neutral-900" />
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white p-4 text-[11px] leading-relaxed text-neutral-500 shadow-sm">
                Pick a room type, then drag a box on the sketch. Tap a room to rename it, change
                its type, or set a premium rate.
              </div>
            )}

            {rooms.length > 0 && (
              <div className="bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]">
                  Layout — {rooms.length} spaces
                </h2>
                <div className="max-h-56 space-y-0.5 overflow-y-auto">
                  {rooms.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelected(r.id)}
                      className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] ${r.id === selected ? "bg-neutral-100" : "hover:bg-neutral-50"}`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: TYPES[r.type].stroke }} />
                      <span className="flex-1 truncate text-neutral-800">{r.label}</span>
                      {(r.type === "shared" || r.type === "ensuite") && (
                        <span className="tabular-nums text-neutral-500">
                          ${r.rateOverride ?? (r.type === "ensuite" ? ensuiteRate : sharedRate)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
