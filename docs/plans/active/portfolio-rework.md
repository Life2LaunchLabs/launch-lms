# Portfolio rework: build plan

Status: phases 1, 2, 3, 5 and 6 in review. The new design is behind a preview switch. Phase 4 (quests) waits on the
plans redesign because it replaces the Launch Ready starter goal. The approved prototype (V5) is the spec:
https://claude.ai/artifact/A6TNb35dcyPXFmwGPiMWpu. The build plan, the CIS and EPP check, and the plan-side
contract are in https://claude.ai/artifact/FE4ZixmgbkCC3kXQLtwJFP.

## Objective

One portfolio that is both the learner's profile and what employers and schools see: highlights, About,
experience, projects, credentials and badges, results, where they're headed, and the people in their corner.
Progress is optional: quests unlock sharing, then the résumé, then a mastery badge; suggestions come only after.

Scope is the portfolio. Plans get their own redesign; anything that needs plan changes waits for it.

## Decisions

- **One identity.** The portfolio edits who you are. `User` keeps legal first and last name, email, username
  and sign-in, and gains `preferred_name` ("the name you go by"). Rosters, reports and the EPP use the legal
  name; everything else shows the name you go by. One photo (`User.avatar_image`; `Portfolio.avatar_asset_id`
  is unused) and one bio (`Portfolio.short_bio`; the migration copies `User.bio` into an empty one).
  `Portfolio.display_name` follows the shown name until screens read `identity` from the shell.
- **New records** (`db/portfolio_records.py`): credentials (cards, certificates, diplomas, test scores; badges
  stay in `BadgeAward`), contacts (people without accounts, linkable to a user later) and their quotes,
  résumé versions, and private documents.
- **Visitors** see public credentials and quotes that aren't only requested. They never see contacts,
  documents, résumé versions, or contact details.
- **Imports are one-time copies**: CIS, LinkedIn and résumés. Nothing stays synced. The CIS importer keeps
  the raw rows of plan-owned sheets so plans can use them later.
- **Grandfathering:** a portfolio that's already public starts with sharing unlocked; nobody loses an action.

## Phases

1. Foundations: identity, new records, migration, API.
2. Shell: stacked header, highlights band, bento grid or list, one-row page headers, row controls, the visitor
   view, the look as the app-wide theme.
3. Content editors: experience page, projects, credentials, My people, About, documents.
4. Progression: quests, spots, unlock moments, mastery badge, suggestions. Replaces the checklist.
5. Résumé builder: letter page, versions, in-page editing, PDF.
6. Imports: CIS zip, LinkedIn data zip or PDF, résumé parsing.

Held for the plans redesign: decision options in "Where I'm headed", the EPP view and sign-off, the course
planner, and importing CIS reflections, saved items and plan history into plans.

## Progress

- [x] Phase 1 API: `preferred_name`, credentials, contacts and quotes, résumé versions, documents, shell
  `identity` and records, migration `d4a7e2b9c1f3` (checked down and up on Postgres with seed rows).
- [x] Phase 1 web service functions and types (`services/portfolio/records.ts`, `portfolioTypes.ts`).
- [x] Phase 2 front page behind `?new=1` / the `portfolio_v2` cookie (`components/Pages/Portfolio/v2/`): stacked
  header with left or centered layout, highlights band (`PUT /me/highlights`), tiles in a grid or list
  (`PUT /me/layout`), the profile dialog with the name you go by, the visitor view. [Verification](../../design/portfolio-v2-shell-verification.md).
- [x] Phase 2 section pages behind the same switch (`v2/PortfolioDetail.tsx`, routed by `v2/portfolioPages.tsx`): one-row
  headers; star (feature) and eye (hide from visitors) on every experience, project, credential and badge, always
  shown while on; experience grouped by type with Add per type and buttons for the types not used yet.

- [x] Phase 3 editors in the new design: credentials (`v2/CredentialDialog.tsx`, a photo counts as proof, test scores
  start private), My people at `/portfolio/people` (contacts, one quote each, references, private email, phone and
  notes), links from the About tile, My documents at `/portfolio/documents` (private), and "What I'm like" results
  (`portfolioresult`, migration `e2c8f4a6b1d7`; `portfolio_results.record_result(user, payload, source,
  source_reference)` is the write plans use). Experience and project editing still use the current dialogs.
- [x] Phase 5 résumé builder (`v2/ResumeBuilder.tsx`, `v2/resumeModel.ts`): a letter-size page (816×1056 CSS px) built
  from the portfolio, scaled to fit; versions with their own layout (classic, modern, compact), accent and what they
  took off (`excluded` now also takes `project:` and `contact:`); a one-page meter and a page-end line; Download prints
  only the page from a copy at the end of the body. Visitors see the page without the email or controls.
- [x] Phase 6 imports at `/portfolio/import` (`portfolio_import_sources.py` reads, `portfolio_imports.py` copies;
  `portfolioimport`, migration `f3d9b5a7c2e8`): an Oregon CIS zip or workbook, or a LinkedIn data zip. A preview to
  pick from, then a one-time copy; each record keeps `source` and a key from the row's content, so the same export
  again adds only what's new. CIS: the Career Bio sheets, links, the Interest Profiler re-scored from its 60 answers,
  the PEP and saved PDFs or pictures as private documents; the export's misplaced skill and activity fields and raw
  Excel dates are handled; the plan sheets (saved items, reflections, plan activities, course plan, other
  assessments) are kept as raw rows on the import; Profile demographics are never read. LinkedIn: positions,
  education, volunteering, honors, projects, certifications, skills and recommendations (as a person with a quote).
- [x] Phase 6 résumé and LinkedIn profile PDFs (`portfolio_import_pdf.py`), by rules as the owner chose on
  30 October 2026 (no AI): text from pypdf, the usual section headings, entries found by their date ranges (LinkedIn
  puts the company first), skills and certifications as lists, references by their email. Everything goes through
  the pick list, and the PDF is kept as a private document.


`TESTING=true uv run pytest src/tests/test_portfolio_records.py src/tests/test_portfolio.py src/tests/test_portfolio_people.py src/tests/test_portfolio_imports.py`

`bunx playwright test portfolio-v2.spec.ts portfolio-access.spec.ts` (see `scripts/ui/run-local.sh`)

## Recovery

The migration only adds a column and tables and fills `preferred_name` and empty bios. Downgrading drops the new
tables and the column; the copied bios stay, which is harmless. The new front page is opt-in per browser;
`?new=0` returns to the current one, and highlights and layout live in `theme_settings`, which the current page ignores.
