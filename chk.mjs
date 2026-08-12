import { runClubProForma, usd, pct, multiple } from './lib/proformaClub.js';
import { pepperPlaceInputs } from './lib/proformaClubPresets.js';
const r = runClubProForma(pepperPlaceInputs());
for (const k of ['bear','base','bull']) {
  const s = r[k], y = s.years[0];
  console.log(k.toUpperCase().padEnd(5),
    'net', usd(y.income.netToOwner).padStart(9),
    'opex', usd(y.expenses.total).padStart(9),
    'NOI', usd(y.noi).padStart(9),
    'DSCR', y.dscr.toFixed(2),
    'CoC', pct(s.year1LeveredCashOnCash).padStart(7),
    'IRR', pct(s.leveredIrr).padStart(7),
    'MOIC', multiple(s.leveredMoic));
}
