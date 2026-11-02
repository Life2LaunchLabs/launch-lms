# New portfolio front page: browser verification

Owner direction: conversation, 28–29 October 2026. Reference: the approved V5 prototype
(https://claude.ai/artifact/A6TNb35dcyPXFmwGPiMWpu, private to owner) and the
[build plan](../plans/active/portfolio-rework.md). This is phase 2: the front page only, behind a preview switch
(`?new=1` on, `?new=0` off, remembered in the `portfolio_v2` cookie). Detail pages, editors, quests and the
résumé builder are later phases and still open the current screens.

## Browser scenario

Synthetic owner account only (seeded with fake names, a school, a job, a volunteer role, a team, three projects,
a food handler card, CPR and an expected diploma, two people with quotes, and three highlights). Current application
on local PostgreSQL and Redis with real sign-in and API saves. Chromium desktop 1280×900 and 1440×900, phone
390×844; the app's dark theme (the portfolio follows the app theme and has no look of its own).

Command: `bunx playwright test portfolio-v2.spec.ts portfolio-access.spec.ts --project=chromium-desktop
--project=chromium-phone` against the app run as in `scripts/ui/run-local.sh`, served on `localhost` over HTTP.

## Findings

- Matches the prototype's order and hierarchy: cover with Settings, avatar above the name, intro line, "now" and
  place, one action row (Add, Share, Résumé, visitor preview), the highlights band, then About (full width),
  Experience (full width), Projects and Credentials & badges side by side, and My people.
- Centered header and list sections save and survive a reload. The first list capture showed wide tiles still
  forcing two columns and oversized thumbnails; wide tiles now only span in grid mode and thumbnails keep their size.
- Phone: the first capture wrapped the preview button onto its own row and left a lone third highlight. The action
  row now stays on one line and an odd last highlight spans the row. No horizontal scroll at 390 px.
- The profile dialog saves first, last and the name you go by, the intro and place; the page shows the new name
  without a reload. "Make my portfolio private" moved into Settings so the phone action row fits.
- The visitor preview hides owner controls, the people count and the Private pill, and shows quotes only.
- The current portfolio shows a "Try the new portfolio" notice; its link and the cookie keep the choice.
- Section pages (Experience, Projects, Credentials & badges) have the one-row header (back, icon, title, Add).
  Starring and hiding saved and showed at once; the visitor preview then left out the hidden experience and
  credential. An active star and a closed eye stay visible; the rest appear on hover, focus, or always on touch.
  The first phone capture overflowed to 498 px because list rows didn't shrink; rows now truncate at 390 px.
  Credential dates read "Jun 2027" instead of "2027-06". The front page's Add menu opens the experience editor here.
- Limitation: the synthetic account is outside the organization, so the app's guest notice covers the top of the
  cover. The spec opens Settings from the keyboard for that reason. Members don't see the notice.
- Not yet built here, by plan: quests and the mastery badge, "What I'm like", "Where I'm headed", and editors for
  credentials, people and links. Single experience and project pages still open the current screens.
