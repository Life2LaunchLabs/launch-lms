# Teacher requirement evidence export verification

Owner direction: conversation, 13 October 2026. Reference: existing assignment,
group and learner requirement surfaces, adopted Button/Dialog/Input/Label, and
the supplied screenshot showing Oregon identifiers overlapping titles. The
[implementation brief](../plans/active/requirement-evidence-export.md) records scope.

## Browser scenario

Synthetic organization and users only, with one approved resume submission, one
pending submission and an unmapped interview requirement. Manual identifiers:
`HS.HECPS`, `HS.HECPS.D`, `HS.HECPS.D.2`, `HS.HECPS.D.3`. Framework version 1.
Current application with isolated PostgreSQL/Redis, real login and API downloads.
Chromium desktop 1440×900 and phone 390×844 CSS pixels; light admin surfaces.

Command: `bash scripts/ui/run-local.sh requirement-evidence.spec.ts
--project=chromium-desktop --project=chromium-phone`, with synthetic credentials
and disposable database URLs in the shell environment. Successful screenshots
are also attached as `synthetic-review:*` in browser CI manifests.

## Findings

- Existing small fixed code columns caused the reported overlap. Codes now occupy
  their natural width at desktop and stack above titles at phone. Inspected root,
  domain and standard rows; expanded/collapsed hierarchy still works.
- Assignment export uses the learner search filter. Keyboard activation opens the
  course-context dialog; download returns only the filtered learner and contains
  the approved evidence and missing requirement. Empty filters disable export.
- Group export includes both reviewed and pending submissions. Permission failures
  display the server message and preserve the dialog for recovery/cancellation.
- Initial phone capture revealed a dialog extending outside the viewport despite
  passing interaction tests. Fixed with explicit viewport-relative width and
  a browser assertion that both dialog edges are inside the viewport.
- Course context uses labeled optional controls; focus, scroll, download and cancel
  remain usable on phone. Pending work is not labeled approved in the CSV.
- The two-route long-code scenario exceeded the default 30-second test budget
  during concurrent cold Next development compilation. Its budget is 60 seconds;
  geometry, visibility and interaction assertions are unchanged. Final run passed.

- Final keyboard review connected the export button to the adopted DialogTrigger.
  New assertions confirm focus returns to the button after download and cancellation.

## Evidence and limits

Final browser run: **6 passed**, finished 13 October 2026 at 13:44 PDT. Inspected
all ten synthetic captures. The phone dialog now has both edges inside the viewport;
root/domain/standard code and title regions remain separate at both sizes.

Implementation base: `09bfd69be6533b28d2d56bfdbb5d4af2c6191ae4`, with delivery
changes on `feat/sb3-requirement-evidence-export`. Browser run worktree fingerprint:
The browser run used revision `2d001dbb3e287e515be2362abe2ce8cd98d2fbd8` plus
the final keyboard-focus change. Browser run worktree fingerprint:
`587cd2b7359298c302741d4b73af0ea88ce1883fca75c4f5adaf6a85f0cd97e9`.
Export audit and leading-column order were separately verified
through a real authenticated local API download. No UI source changed afterward.

- [Browser result manifest](requirement-evidence-export/browser-results.json)
- [Desktop course context](requirement-evidence-export/desktop-export-course-context.png)
- [Phone course context](requirement-evidence-export/phone-export-course-context.png)
- [Desktop assignment filter](requirement-evidence-export/desktop-assignment-export-filtered.png)
- [Phone assignment filter](requirement-evidence-export/phone-assignment-export-filtered.png)
- [Desktop group requirements](requirement-evidence-export/desktop-group-requirement-export.png)
- [Phone group requirements](requirement-evidence-export/phone-group-requirement-export.png)
- [Desktop explorer codes](requirement-evidence-export/desktop-explorer-long-codes.png)
- [Phone explorer codes](requirement-evidence-export/phone-explorer-long-codes.png)
- [Desktop learner codes](requirement-evidence-export/desktop-learner-long-codes.png)
- [Phone learner codes](requirement-evidence-export/phone-learner-long-codes.png)

Focused service tests: **9 passed**, including permission boundaries, shared/multiple
evidence, pending/approved/revoked records, formula escaping, confidential-note
exclusion, activity response history and assigned-version continuity. Real local
HTTP verification passed for CSV leading columns, `Cache-Control: no-store`, and
an actor/status audit record without learner evidence or request-body data.
Repository checks: `./scripts/agent check --changed` and `--all` passed:
documentation/product/architecture/source-size gates, frontend lint and types,
61 frontend unit tests, API lint, and **681 API tests passed**, with nine existing
skips and one expected failure. Browser fixture seed lint also passed.

No screenshot baseline was promoted and no owner deviation was assumed. School
signoff and academic credit decisions remain with the school. Jira workpad linkage
is blocked because Jira credentials are absent; this report is linked from the PR.

## Owner test steps

1. Open an active group plan assignment, filter learners and choose **Export
   evidence CSV**. Add optional course code/name, section and term; download.
2. Open the CSV. Confirm the intended learners, official requirement codes,
   evidence fields/links, approval actor/dates and missing requirements. Pending
   submissions should say **Awaiting staff review**. Auto-graded activity records
   should retain their grading status and should not imply teacher approval.
3. Try the same export from group Requirements and a learner's Requirements tab.
   Check the enrollment's version and any explicit staff-attestation rows.
4. Inspect long Oregon codes in the explorer and learner tree at desktop and phone.
