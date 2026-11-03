# Life plans: first build

Status: first cut, Oregon first. Builds the budget screen from the life-plans prototype
(https://claude.ai/artifact/N2MuwREy3jdqiEaT733zSS) and follows the build plan
(https://claude.ai/artifact/T4FDKbetAh1ktkTDRhWiUp). Since 2026-11-03 there is no `/life` page: a phase's budget opens from the phase in Plans at
`/plans/phase/<id>/budget` (`/life` redirects to Plans, and `/life?of=` to `/plans/shared/<user uuid>`).

## The sources rule

Every estimate the app shows comes from a published source. The app works with no sources at all:
lines without an estimate ask for the learner's own number. Nothing in the code holds a figure.

- `EstimateSource`: who published it, the dataset, the release, the URL, when we retrieved it.
- `EstimateFact`: one figure for a metric, a place and some dimensions (`rent`, `county:OR:lane`,
  `{bedrooms: 2}`), with percentiles when published. Facts come in as `draft`; only `reviewed`
  facts are used.
- Resolving a query walks the place ladder (town, county, BLS area, state, US) and drops optional
  dimensions from the end. The most specific reviewed fact wins, the newest release first, and the
  answer says which place and level it came from, so the page can say "No figure for Eugene itself yet".

## Data loading

Superadmins upload official files to `POST /api/v1/life/admin/import` (`kind`, `year`, `url`, `file`),
then mark the source reviewed with `POST /api/v1/life/admin/sources/{key}/review`.

- `hud_fmr`: HUD Fair Market Rents county file (csv or xlsx with `fmr_0`..`fmr_4`). Oregon counties.
- `bls_oews`: BLS OEWS all-data file. Keeps US, state and Oregon metro and nonmetro areas, detailed
  occupations; hourly percentiles, or annual where hourly isn't published.

Oregon places (`services/life_plans/places.py`) map about 50 towns to their counties and every
county to its BLS area (BLS county crosswalk, May 2024).

## API (`/api/v1/life`)

`GET/PUT/DELETE /plan` (one plan per learner, a validated JSON document, revision check returns 409),
`GET /catalog`, `GET /places`, `GET /occupations`, `POST /estimates`, and the admin routes above.

## Web (`components/LifePlan/`)

Context bar (phase switcher and stretches), one-phase chart with a full-screen view of all phases,
the budget table (estimate, source, range, own number, calculator), the add tray, and cards for
one-time money, debt, savings and things you own. The money arithmetic is in `model.ts`.

## Not yet

Taxes (needs IRS and Oregon DOR rule sources), estimates beyond rent and pay, places outside Oregon
below the state level, a nav entry, and links from plans and portfolio.
