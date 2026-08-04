import { createClient } from "@supabase/supabase-js";
import { sendGmail, threadHasReply } from "../../../../lib/gmail";

// ============================================================
// GET /api/cron/follow-up   (weekdays, via vercel.json)
//
// Two passes:
//   1. Check open threads. Anyone who replied gets marked replied,
//      which removes them from the follow-up queue entirely.
//   2. Nudge whoever is left and has been quiet 3+ days.
//
// Pass 1 is why this runs on Workspace instead of a sending API:
// nobody gets chased for a deal they already answered.
// ============================================================

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const replies = [];
  const nudges = [];

  try {
    // ---- pass 1: detect replies ----
    const { data: open } = await admin.from("outreach_awaiting_reply").select("*");

    for (const row of open || []) {
      const check = await threadHasReply({
        accountId: row.sent_from_account_id,
        threadId: row.gmail_thread_id,
      });

      await admin
        .from("deal_outreach")
        .update({
          last_checked_at: new Date().toISOString(),
          ...(check.replied
            ? { status: "replied", replied_at: check.repliedAt }
            : {}),
        })
        .eq("id", row.id);

      if (check.replied) replies.push({ from: row.full_name, at: check.repliedAt });
    }

    // ---- pass 2: follow up on silence ----
    const { data: pending } = await admin
      .from("outreach_needing_follow_up")
      .select("*");

    for (const row of pending || []) {
      const firstName = row.full_name?.split(" ")[0] || "there";
      const url = `${process.env.NEXT_PUBLIC_SITE_URL}/deals/${row.slug}`;

      const body = [
        `${firstName},`,
        ``,
        `Following up on ${row.address_line}. It's still available, but I need to know either way before I can lock it up.`,
        ``,
        `The numbers and floor plan are here if you want another look: ${url}`,
        ``,
        `A no is fine — I just don't want to hold it if it isn't a fit.`,
        ``,
        `Thank you,`,
      ].join("\n");

      try {
        // Same threadId keeps the nudge under the original email in
        // Gmail instead of starting a second conversation.
        await sendGmail({
          accountId: row.sent_from_account_id,
          to: row.email,
          toName: row.full_name,
          subject: `Re: ${row.subject}`,
          text: body,
          threadId: row.gmail_thread_id,
        });

        await admin
          .from("deal_outreach")
          .update({ follow_up_sent_at: new Date().toISOString() })
          .eq("id", row.id);

        nudges.push({ to: row.email, deal: row.address_line, days: row.days_since_sent });
      } catch (e) {
        nudges.push({ to: row.email, error: e.message });
      }
    }

    return Response.json({
      ok: true,
      repliesDetected: replies.length,
      followUpsSent: nudges.filter((n) => !n.error).length,
      replies,
      nudges,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
