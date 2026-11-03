# Life plans: first build

Status: first cut, Oregon first. Builds the budget screen from the life-plans prototype
(https://claude.ai/artifact/N2MuwREy3jdqiEaT733zSS) and follows the build plan
(https://claude.ai/artifact/T4FDKbetAh1ktkTDRhWiUp). The page is at `/life`; it is not in the nav yet.

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

## Public catalog (`services/life_plans/public_data.py`)

Facts are numbers; catalog entries are things a learner picks. Both load through the same upload,
land as drafts tied to an `EstimateSource`, and show only once that source is reviewed.

- `onet`: the O*NET text database (`db_31_0_text.zip`), CC BY 4.0. `CareerEntry` per O*NET-SOC code:
  title, description, RIASEC profile (Interests, OI scale 1 to 7), job zone, up to 25 other titles.
  `soc` is the six-digit code BLS pay facts use. A newer release replaces the older one's careers.
- `scorecard`: the College Scorecard most recent institution file (`Most-Recent-Cohorts-Institution.csv`,
  or the data zip holding it). `SchoolEntry` per operating school (federal unit id): type, main degree,
  undergrad size, admission and completion rates, median earnings 10 years after entry. In-state and
  out-of-state tuition load as `tuition` facts (`place: us`, dims `school` + `residency`, yearly).
- Career matching correlates the learner's six RIASEC scores with each career's profile, so any scale works
  (the CIS import's 0 to 40, O*NET's 1 to 7). It ranks; it doesn't predict, and the response says so.

Not yet: Scorecard fields of study (programs by CIP code), CareerOneStop (videos, certifications,
apprenticeships; needs a registered key), outlook, and the budget's tuition line picking a school.

## API (`/api/v1/life`)

`GET/PUT/DELETE /plan` (one plan per learner, a validated JSON document, revision check returns 409),
`GET /catalog`, `GET /places`, `GET /occupations`, `POST /estimates`, `GET /careers`, `GET /careers/{code}`,
`POST /careers/match`, `GET /schools`, `GET /schools/{unitid}`, and the admin routes above.

## Web (`components/LifePlan/`)

Context bar (phase switcher and stretches), one-phase chart with a full-screen view of all phases,
the budget table (estimate, source, range, own number, calculator), the add tray, and cards for
one-time money, debt, savings and things you own. The money arithmetic is in `model.ts`.

## Not yet

Taxes (needs IRS and Oregon DOR rule sources), estimates beyond rent and pay, places outside Oregon
below the state level, a nav entry, and links from plans and portfolio.
