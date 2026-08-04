# Green Light Buying Machine — Deal System

One deal record drives five outputs: the loan request, the conversion sketch,
the buyer pro forma, the turnkey flyer, and the buyer email. Every number in
every document comes from `lib/proforma.js`, so a figure can't disagree with
itself across two documents that landed in the same buyer's inbox.

## Files

```
app/
  page.jsx                      deal list
  layout.jsx  globals.css       shell + Tailwind
  deals/new/page.jsx            new deal
  deals/[slug]/page.jsx         the workspace — tabs across all five outputs
  crm/page.jsx                  pipeline board, contacts, tasks
  crm/[id]/page.jsx             contact timeline and detail
  settings/page.jsx             connect Google, manage buyers, market freshness
  p/[token]/page.jsx            public buyer link (no auth)

supabase/migrations/
  001_deals_schema.sql          deals, deal_rooms, padsplit_market, deal_comps,
                                org_assumptions, pro_forma_snapshots, deal_summary view
  002_documents_and_policies.sql deal_documents, deal_contacts, deal_outreach,
                                storage buckets, RLS, triggers
  003_google_workspace.sql      email_accounts, Gmail threading, reply views
  004_crm.sql                   deal_interests, activities, tasks, auto-log triggers

lib/
  crm.js                        pipeline, timeline, tasks
  gmail.js                      Gmail send, MIME building, reply detection
  proforma.js                   calculation engine — the single source of truth
  queries.js                    Supabase client + all data access
  email.js                      buyer email templates + preflight warnings

components/
  PipelineBoard.jsx             drag-and-drop kanban
  ContactDetail.jsx             timeline, tasks, deals per buyer
  DealForm.jsx                  intake, keyed off the source documents
  ConversionSketch.jsx          draw the layout on the assessor sketch
  ProForma.jsx                  interactive buyer pro forma
  DealFlyer.jsx                 turnkey flyer, print to PDF
  EmailComposer.jsx             buyer email with preflight checks

app/api/auth/google/route.js   OAuth consent
app/api/auth/google/callback/  stores the refresh token
app/api/send-deal/route.js     sends via Gmail, attaches docs, logs the thread
app/api/cron/follow-up/route.js detects replies, then nudges the quiet ones
vercel.json                    cron schedule — weekdays 9am Phoenix
```

Stack is repo + Vercel + Supabase + Google Workspace. No third-party CRM,
no sending service — deal emails go out of the actual mailbox.

## Setup

```bash
npm install
cp .env.example .env.local     # fill it in
npm run dev
```

Everything is included — Next.js 14 App Router, Tailwind, and the Supabase
client. No other services.

Copy `.env.example` to `.env.local` and fill it in. `SUPABASE_SERVICE_ROLE_KEY`
and `CRON_SECRET` are server-only — set them in Vercel project settings, never
in a `NEXT_PUBLIC_` variable.

Run both migrations in the Supabase SQL editor, in order.

Tailwind must be configured — components use core utility classes only.

## Build order

1. **Migrations + DealForm.** Key in 2101 W Paradise Dr from the assessor
   printout. Confirm the record saves and the slug generates.
2. **ConversionSketch.** Upload the assessor sketch, draw 9 bedrooms and
   4 baths, save. Check `deal_rooms` has 9 rows and `deals.bedrooms` updated
   to 9 on its own.
3. **ProForma.** Should already work — it reads what steps 1 and 2 wrote.
4. **DealFlyer.** Print to PDF and hold it next to the existing flyer.
5. **EmailComposer.** Generate Michael's email. It should reproduce the one
   already sent, number for number.
6. **Connect Google Workspace.** Visit `/api/auth/google` and consent as the
   person who sends deals. Setup is in the next section.
7. **Add buyers to `deal_contacts`, then send.**
8. **Enable the cron last.** Set `CRON_SECRET` in Vercel, then confirm
   `outreach_needing_follow_up` returns what you expect before the first run.

## The one decision that shapes everything

PadSplit has no public API. `padsplit_market` is populated by hand from the
market insights screen — seven fields per ZIP, and the data barely moves month
to month. `marketIsStale()` flags anything over 60 days on the deal page.

Revisit scraping at 20+ ZIPs. Below that, manual entry costs less than
maintaining a scraper.

## Seed the two known markets

```sql
insert into padsplit_market
  (zip, active_units, upcoming_units, shared_weekly, private_weekly,
   avg_occupancy, days_to_first_booking, days_to_80_percent)
values
  ('85203', 85, 0, 208, 313, 0.73, 4, 25),
  ('85029', 77, 0, 195, 291, 0.74, 4, 30)
on conflict (zip) do update set
  active_units = excluded.active_units,
  shared_weekly = excluded.shared_weekly,
  private_weekly = excluded.private_weekly,
  avg_occupancy = excluded.avg_occupancy,
  fetched_at = now();
```

## Notes on the math

- **Bedrooms come from the sketch, not the form.** `saveRooms()` writes
  `deals.bedrooms` and `deals.ensuite_count` from what was drawn. The form field
  for bedrooms is deliberately absent.
- **Room rates resolve in order:** explicit `weekly_rate` on the room, then the
  on-screen override, then the market rate for that room type. A premium corner
  room can carry its own price without touching anything else.
- **Taxes** default to the last assessed bill × 2.35. Most listings you pull are
  owner-occupied and reclass to rental on sale. Override per deal when you have
  the real number.
- **Two occupancy bases.** GLBM underwriting uses 5% vacancy. Market uses the
  actual occupancy for the ZIP — 73% in 85203 means 27% vacancy. Show buyers the
  market figure; underwrite on the standard.
- **Snapshots** record the exact inputs and outputs behind a buyer link, so a
  conversation three months later can be reconstructed.

## What isn't built

- PDF generation server-side. The flyer prints from the browser today; if you
  want documents auto-attached to email, add a Puppeteer route that renders
  `/deals/[slug]/flyer` and writes through `recordDocument()`.
- The loan request generator. The Word packet exists as a document; wiring it to
  pull from `deals` is straightforward once the record is proven.
- Gmail push notifications. The cron polls threads once a day; if you want
  replies detected within seconds, wire Gmail `users.watch` to a Pub/Sub topic
  and a webhook route.
- Scale calibration on the sketch. Boxes are proportional, not measured. Add if
  you need square footage per room for code compliance.

## The CRM

The pipeline is the **buyer × deal pair**, not the buyer. Michael can pass on one
property and commit on the next, and both need to stay true at once — so a card
on the board is a row in `deal_interests`, and a contact is the person behind
several cards.

Stages: sent → viewed → reviewing → call set → offer → committed → closed, plus
passed (with a reason, which is the useful part).

**It logs itself.** Database triggers, not application code:

| What happens | What lands on the timeline |
|---|---|
| Deal email sends | `email_sent`, and a card opens in Sent |
| Buyer replies (cron detects it) | `email_replied`, card moves to Reviewing |
| Buyer opens the pro forma link | `proforma_viewed`, card moves to Viewed |
| You drag a card | `stage_changed` with from/to |
| Card reaches Closed | Buyer's purchase count and volume update |

Because it's trigger-based, the record is complete whether the action came from
the app, a cron run, or a hand-written SQL update. Notes, calls, and meetings are
the only things typed by a person; they show in green, automatic entries in grey.

Cards go stale on a per-stage clock — an offer untouched for three days flags,
a fresh send gets five. `pipeline_stalled` drives the banner.

## Google Workspace setup

In Google Cloud Console, on a project inside the Workspace org:

1. Enable the **Gmail API**.
2. OAuth consent screen: **Internal** user type. Internal skips Google's
   verification review — external would mean weeks of waiting for scopes this
   sensitive. Add scopes `gmail.send`, `gmail.readonly`, `userinfo.email`.
3. Credentials → OAuth client ID → Web application. Authorized redirect URI:
   `https://yourdomain.com/api/auth/google/callback`. Add the localhost version
   too for development.
4. Put the client ID and secret in the environment.
5. Visit `/api/auth/google` and consent as the sender.

Google returns a refresh token **only on first consent**. If you need a new one,
remove the app at `myaccount.google.com/permissions` and connect again. The
callback fails loudly rather than storing an account that can't send later.

Multiple senders can connect — one row per mailbox in `email_accounts`, with one
marked default. Pass `accountId` to send as someone specific.

Limits: 2,000 messages a day on Workspace, 25MB per message. The send route
stops at 24MB with a message naming the problem.

## Automation

Three routes, no external workflow tool.

**`POST /api/send-deal`** — sends from the connected mailbox, pulls selected
documents out of private storage as attachments, writes `deal_outreach` with the
Gmail thread id, and links the pro forma snapshot to the buyer.

**`GET /api/cron/follow-up`** — weekdays at 9am Phoenix, in two passes.

*Pass one* reads `outreach_awaiting_reply` and checks each Gmail thread. A message
from anyone but the sender means they answered; that outreach flips to `replied`
and drops out of the follow-up queue.

*Pass two* reads `outreach_needing_follow_up` — sent 3+ days ago, no reply, deal
still `for_sale` — and sends one nudge each, on the original `threadId` so it
appears under the first email rather than starting a new conversation.
`follow_up_sent_at` makes it idempotent.

Pass one is the reason for running on Workspace. A sending API can tell you an
email was opened; only the mailbox knows someone wrote back. Nobody gets chased
for a deal they already answered.

Cron auth is a bearer token in `CRON_SECRET`. Vercel sends it automatically; the
route rejects anything else.

To add stages later, extend the views rather than the routes. The query is the
policy — "who needs contact and why" stays readable in SQL instead of buried in
JavaScript.
