# Where these files go

The zip mirrors your project structure. Unzip it at the **root of your GLBM
repo** and every file lands in the right place:

```
glbm-proforma-club/
├── lib/proforma-club/
│   ├── index.ts        <- import from here
│   ├── types.ts
│   ├── engine.ts
│   └── presets.ts
├── app/proforma-club/
│   └── page.tsx        <- new route at /proforma-club
├── supabase/migrations/
│   └── 20260812000000_club_proformas.sql
├── INTEGRATION.md      <- full notes, isolation checklist, engine behavior
└── README-FIRST.md     <- this file
```

If you drag the folders in manually, the only thing that matters is that
`lib/proforma-club/` and `app/proforma-club/` sit at the same level as your
existing `lib/` and `app/`.

## Nothing here overwrites anything

Every path is new. There is no file in this zip that shares a name with a file
you already have — check before you unzip if you want to be certain:

```bash
unzip -l glbm-proforma-club.zip
```

Compare that list against your repo. If nothing collides, the unzip is purely
additive.

## Three steps

1. **Unzip at the repo root.** No existing file is touched.

2. **Run the migration.**
   ```bash
   npx supabase migration up
   ```
   Or paste the SQL into the Supabase SQL editor. It's `CREATE`-only — no
   `ALTER`, no `DROP` against anything that already exists.

3. **Visit `/proforma-club`.** It loads the 1541 W Pepper Pl seed deal
   immediately. No database write is needed to see it work; the table only
   matters once you wire up save/load.

## Imports need no configuration

`page.tsx` uses relative imports (`../../lib/proforma-club/engine`), so they
resolve whether or not your `tsconfig.json` defines an `@/*` path alias, and
regardless of where that alias points. Nothing to configure.

This is verified against a strict `tsc --noEmit` with React types and no path
alias at all — the same resolution Next's build uses.

If the build says it can't resolve `../../lib/proforma-club/...`, the lib folder
didn't land at your repo root. Check:

```bash
ls lib/proforma-club/
# index.ts  types.ts  engine.ts  presets.ts
```

## Removing it

```bash
rm -rf lib/proforma-club app/proforma-club
```

Then run the rollback at the bottom of the migration file. Your app is back
exactly where it started.

## Read next

`INTEGRATION.md` has the isolation checklist, what the engine does differently
from the benchmark template, the seed-deal output table, and the internal vs.
external label setup.
