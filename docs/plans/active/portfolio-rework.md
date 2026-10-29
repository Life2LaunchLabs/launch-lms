# Portfolio rework: build plan

Status: phase 1 in progress. The approved prototype (V5) is the spec:
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

1. Foundations: identity, new records, migration, API. (This PR.)
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
- [ ] Phase 1 web service functions and types (with phase 2).

## Verification

`TESTING=true uv run pytest src/tests/test_portfolio_records.py src/tests/test_portfolio.py src/tests/test_portfolio_people.py`

## Recovery

The migration only adds a column and tables and fills `preferred_name` and empty bios. Downgrading drops the new
tables and the column; the copied bios stay, which is harmless.
