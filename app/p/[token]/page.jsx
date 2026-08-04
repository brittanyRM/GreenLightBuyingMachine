"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/queries";
import ProForma from "../../../components/ProForma";

// ============================================================
// /p/[token] — the buyer-facing pro forma link.
//
// No auth. RLS allows anon reads only for deals marked
// buyer_link or public, so an unlisted deal 404s even with a
// valid-looking token.
// ============================================================

export default function SharedProForma({ params }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    (async () => {
      try {
        const { data: snap, error } = await supabase
          .from("pro_forma_snapshots")
          .select("*, deals(*)")
          .eq("share_token", params.token)
          .single();
        if (error || !snap?.deals) throw new Error("not found");

        await supabase.rpc("mark_snapshot_viewed", { token: params.token });

        const deal = snap.deals;
        const [rooms, comps, market] = await Promise.all([
          supabase.from("deal_rooms").select("*").eq("deal_id", deal.id).order("room_number"),
          supabase.from("deal_comps").select("*").eq("deal_id", deal.id),
          supabase.from("padsplit_market").select("*").eq("zip", deal.zip).maybeSingle(),
        ]);

        setState({
          loading: false,
          deal,
          rooms: rooms.data || [],
          comps: comps.data || [],
          market: market.data || null,
        });
      } catch {
        setState({ loading: false, notFound: true });
      }
    })();
  }, [params.token]);

  if (state.loading)
    return <div className="p-10 text-center font-sans text-sm text-neutral-500">Loading…</div>;

  if (state.notFound)
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-8 font-sans">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-bold text-neutral-900">This link isn't available</h1>
          <p className="mt-2 text-sm text-neutral-600">
            It may have expired or the deal may no longer be offered. Reach out and we'll send a
            current one.
          </p>
        </div>
      </div>
    );

  return (
    <ProForma
      deal={state.deal}
      rooms={state.rooms}
      market={state.market}
      comps={state.comps}
      readOnly
    />
  );
}
