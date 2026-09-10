import { NextResponse } from "next/server";
import { admin } from "../../../../lib/supabaseAdmin";
import { rateTiers, pppCostForDown, PPP_KEY, RATE_KEYS } from "../../../../lib/proforma";

export const dynamic = "force-dynamic";

// ============================================================
// Read-only market reference data, no authentication.
//
// This exists so the standalone calculator at /buyer-calculator.html
// can show real PadSplit rates and real city research to someone who
// is not a user of the system. Everything here is already shown to
// buyers on a shared sheet, so none of it is new exposure — but the
// select lists are explicit rather than "*" so a column added to
// either table later cannot leak through this route by accident.
//
// Nothing deal-specific is returned. No prices, no addresses, no
// contacts, no assignments.
// ============================================================

const MARKET_FIELDS =
  "zip, metro, active_units, upcoming_units, shared_weekly, private_weekly, avg_occupancy, days_to_first_booking, days_to_80_percent, latitude, longitude";

const REPORT_FIELDS =
  "city, state, population, population_prior, population_year, households, median_household_income, median_age, renter_share, as_of";

export async function GET() {
  try {
    const [{ data: markets, error: mErr }, { data: reports, error: rErr }, { data: orgRows }] =
      await Promise.all([
        admin()
          .from("padsplit_market")
          .select(MARKET_FIELDS)
          .order("zip"),
        admin()
          .from("market_reports")
          .select(REPORT_FIELDS)
          .eq("active", true)
          .order("city"),
        // Lender pricing, so the standalone calculator quotes the same
        // rates as the pro forma. Only the pricing keys are selected —
        // org_assumptions also holds figures that aren't a buyer's
        // business.
        admin()
          .from("org_assumptions")
          .select("key, value")
          .in("key", [...Object.values(RATE_KEYS), PPP_KEY]),
      ]);

    if (mErr) throw new Error(mErr.message);

    // A missing market_reports table or an empty one is not an error —
    // the calculator simply doesn't offer the research panel.
    const org = {};
    for (const r of orgRows || []) if (r && r.key != null) org[r.key] = r.value;
    const tiers = rateTiers(org);

    return NextResponse.json({
      markets: markets || [],
      reports: rErr ? [] : reports || [],
      // Percentages, matching how the calculator writes rates in its
      // own fields — converting in one place beats each caller
      // remembering whether 6.875 or 0.06875 came back.
      lending: {
        tiers: [
          [15, +(tiers[0.15] * 100).toFixed(3)],
          [20, +(tiers[0.2] * 100).toFixed(3)],
          [25, +(tiers[0.25] * 100).toFixed(3)],
        ],
        pppCost: pppCostForDown(0.25, 15000, org),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
