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

Platform › Datasets (formerly Estimates; `/admin/platform/estimates` redirects) shows each expected dataset
(`services/life_plans/datasets.py`: HUD FMRs, BLS OEWS, O*NET, College Scorecard) with what it is, how we use it,
its license and the file to import. A dataset's page has a tab per loaded release, newest first, and each
release's tables (facts, careers, schools) to search, filter, page through and export as CSV:
`GET /admin/datasets`, `GET /admin/datasets/{key}/rows`, `GET /admin/datasets/{key}/export`. Rows are never
edited there; a release is approved, sent back to draft or retired as a whole.

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

## Proposed: keeping resources current when a dataset updates

Not built yet. How it works today, and what goes wrong:

- Facts are safe. A new release is a new source, so the older reviewed release keeps answering
  estimates until the new one is approved, and the newest reviewed release wins after that.
- Careers and schools are not. Importing a new O*NET or Scorecard file deletes the reviewed entries with
  the same codes and adds them back as drafts, so career pages, Career swipe and school lookups lose them
  until someone approves the new release.
- Career and school resources are copies. `add_career_resources` and `add_school_resources` write the title,
  description and tags into each organization's `Resource` once. They go stale when the data changes, and a
  career O*NET retires or merges leaves a resource pointing at nothing. The career profile itself reads live
  entries and facts, so pay and tasks do update.

Proposal:

1. **Releases, not replacements.** Keep entries per release (`source_id` + code) and read "the newest reviewed
   release that has this code". Importing never touches live rows; approving a release makes it the one that
   answers, and retiring the older release is a separate step.
2. **Resources point at the data.** A career or school resource stores its dataset reference (`onet:29-1141.00`,
   `scorecard:209038`) next to its link. Text built from the data (description, tags, title) is generated
   from the current reviewed entry rather than stored, or regenerated when a release is approved. Staff
   edits to a resource's own fields win over generated ones.
3. **Approval runs a sync.** Approving a release updates every organization's resources that reference it,
   and reports what changed: updated, renamed, and retired or merged codes (O*NET's taxonomy crosswalks map
   old codes to new). Retired ones leave Discover and are listed for staff. Learners' saved careers and plan
   steps keep their reference and follow the mapping.
4. **Channels can follow a dataset.** A channel may carry a rule ("all reviewed Oregon schools", "careers in
   job zones 1 to 3"), so new entries join it on approval instead of needing the MCP tool again.
5. **Preview before approve.** The dataset page shows what approval would change (rows added, changed and
   removed, and how many resources in how many organizations) before the button is pressed.
6. **Composite datasets rebuild from their inputs.** A composite (an Oregon occupation table joined from
   O*NET, BLS and state data) lists its inputs. Approving an input marks it stale and rebuilds it as a draft
   release, which is reviewed like any other.

## Not yet

Taxes (needs IRS and Oregon DOR rule sources), estimates beyond rent and pay, places outside Oregon
below the state level, a nav entry, and links from plans and portfolio.
