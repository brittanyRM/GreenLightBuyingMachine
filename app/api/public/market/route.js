import { NextResponse } from "next/server";
import { admin } from "../../../../lib/supabaseAdmin";

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
    const [{ data: markets, error: mErr }, { data: reports, error: rErr }] =
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
      ]);

    if (mErr) throw new Error(mErr.message);

    // A missing market_reports table or an empty one is not an error —
    // the calculator simply doesn't offer the research panel.
    return NextResponse.json({
      markets: markets || [],
      reports: rErr ? [] : reports || [],
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
