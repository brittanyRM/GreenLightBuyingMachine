# Club-Format Pro Forma — drop-in module

Additive by construction. Nothing outside these paths is read or written.

```
lib/proforma-club/types.ts        type definitions, zero imports
lib/proforma-club/engine.ts       pure calc functions
lib/proforma-club/presets.ts      defaults + the Pepper Pl seed deal
app/proforma-club/page.tsx        new route at /proforma-club
supabase/migrations/20260812000000_club_proformas.sql
```

## Isolation checklist

- [ ] No existing file is modified. Only new files are added.
- [ ] The migration contains `CREATE` statements only — no `ALTER`, no `DROP`
      against anything that already exists.
- [ ] The trigger function is namespaced `club_proformas_touch_updated_at` so it
      cannot overwrite an existing `set_updated_at()`.
- [ ] `club_proformas.deal_id` is a bare uuid, not a foreign key. Add the
      constraint later if you want it; the module works without it.
- [ ] `page.tsx` imports nothing from your existing components or styles.
- [ ] No route, table, or CSS class name collides with anything you have.

To remove the whole thing: delete the four files, delete the folders, run the
rollback at the bottom of the migration. Nothing else changes.

## Install

```bash
npx supabase migration up          # or paste the SQL into the SQL editor
```

Then visit `/proforma-club`. It loads the Pepper Pl seed deal immediately, no
database write required — the table is only needed once you want to save.

Imports in `page.tsx` are relative, so no `tsconfig.json` path alias is
required. Verified against a strict `tsc --noEmit` with no alias configured.

## Naming

Two labels in `presets.ts`:

- `INTERNAL_LABEL` — `'Mogul format'`. Your screens only.
- `EXTERNAL_LABEL` — `'GLBM pro forma'`. Everything else.

`resolveLabel(internal = false)` defaults to external, so a caller has to opt
into the internal name deliberately. The page's **Internal view** checkbox is
the only thing that flips it, it starts off, and it isn't persisted — reloading
returns to the external label, so the internal name can't survive into a
screenshot, PDF, or shared link by accident.

Internal view also gates the two panels that reference the benchmark method: the
gross-value-over-equity parity note and the itemized-vs-flat expense comparison.
Both are analysis tools, not investor content.

No logo, wordmark, color scheme, or trade dress from another company appears
anywhere in the module. Descriptive reference to a competitor by name in your
own internal tooling is a much lower-risk posture than using their marks — but
it's still worth a short conversation with counsel before anything ships.

## What the engine does differently

**Income starts from room rates, not a lump rent.** Gross scheduled → occupancy →
collections → platform booking fees → platform service fee → net to owner. Every
return metric builds from net to owner. On the Pepper Pl seed deal that's a 27%
haircut from the headline gross.

**Booking fees don't scale with occupancy.** They're charged per move-in on the
full weekly rate, so a high-turnover year costs twice: less rent collected and
more fees paid. `turnsPerRoomPerYear` is the lever; it's the single most
underestimated input in co-living underwriting.

**Expenses are itemized.** The flat monthly catch-all common in these templates
lands roughly 45% light on an 8–9 bed house once landlord-paid utilities,
turnover, and cleaning are real. `buildBenchmarkExpenses()` reproduces the flat
treatment so the UI can show the gap side by side.

**Projected position value = subscription × levered MOIC.** Not gross property
value divided by equity. The latter never subtracts the loan payoff and
overstates the modeled profit substantially — `benchmarkParity` computes it
anyway, flagged `isNonStandard`, so you can quantify the delta internally
without publishing it.

**Reserve treatment is explicit.** `capitalizeReserves` toggles whether reserves
sit in the equity denominator. Confirm it against an actual closing statement
before trusting any cash-on-cash number.

## Seed deal output (1541 W Pepper Pl, $540K, 9 beds)

| | Bear | Base | Bull |
|---|---|---|---|
| Occupancy | 80% | 87% | 93% |
| Net to owner | $63,804 | $72,734 | $80,156 |
| Operating expenses | $34,162 | $34,519 | $34,816 |
| NOI | $29,642 | $38,214 | $45,339 |
| DSCR, Yr 1 | 1.08 | 1.40 | 1.66 |
| Levered CoC, Yr 1 | 0.98% | 4.60% | 7.62% |
| Levered IRR | 0.83% | 9.14% | 15.69% |
| Equity multiple | 1.08x | 1.94x | 2.80x |

Defaults are deliberately conservative. `COLIVING_OPEX_PER_BED` in `presets.ts`
is where to tune once you have real operating statements — Brian's numbers from
1509 and 1209 W Pepper would be the right source.

## Next

- Wire save/load against `club_proformas` (the table is ready; no API route is
  included so nothing touches your existing auth middleware).
- Add a PDF export if you want parity with the offering-page format.
- Pull `conversionCapex` and `furnishingCost` from ConversionSketch when you're
  ready to connect them — both default to 0 and are inert until you do.
