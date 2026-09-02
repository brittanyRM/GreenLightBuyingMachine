-- Lender terms and fixed costs, restated as rates.
--
-- Closing costs were a flat $6,500 — identical on a $300k house and a
-- $700k one. Taxes and insurance were guessed from the last assessed
-- bill plus a flat premium. Both are now percentages of price, which
-- is how the deals are actually underwritten.

insert into org_assumptions (key, value, label, unit, notes) values
  ('origination_points',  0.015,   'Origination points',      'percent',  'of loan amount'),
  ('closing_costs_pct',   0.01,    'Closing costs',           'percent',  'of purchase price'),
  ('tax_insurance_rate',  0.00474, 'Taxes & insurance',       'percent',  'of purchase price, per year'),
  ('interest_rate',       0.065,   'Interest rate',           'percent',  'default tier — 25% down')
on conflict (key) do update
  set value = excluded.value,
      label = excluded.label,
      unit  = excluded.unit,
      notes = excluded.notes;

-- Rate by down payment lives in code (RATE_BY_DOWN in lib/proforma.js):
--   15% down -> 7.750%
--   20% down -> 6.625%
--   25% down -> 6.500%

update org_assumptions
   set notes = 'superseded by closing_costs_pct'
 where key = 'closing_costs';

update org_assumptions
   set notes = 'superseded by tax_insurance_rate'
 where key = 'insurance_annual';
