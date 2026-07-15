# Portfolio Journey refinement visual QA

- Source visual truth: user-attached current Journey screenshot, grouped mobile timeline reference, and borderless compact-card refinement screenshot.
- Implementation: `apps/web/components/Pages/Portfolio/Journey.tsx`.
- Target states: populated owner Journey collection; chapter editor with images; chapter detail with linked Work.
- Target viewports: supplied desktop collection viewport and narrow mobile reference.
- Implementation screenshot: unavailable because no browser capture surface is exposed in this environment.

## Full-view comparison evidence

Blocked. Source imagery was inspected, but a browser-rendered implementation capture is unavailable for the required same-viewport comparison.

## Focused region comparison evidence

Blocked. Code inspection confirms year headings above grouped entries, per-group rails, card-midpoint markers, chapter-owned cover selection, and cover-led horizontal Work cards, but code inspection is not visual evidence.

## Findings

- [P2] Timeline geometry remains visually unverified.
  Location: Journey year groups, rail, markers, and cards.
  Evidence: the implementation now derives marker position from each card's 50% vertical midpoint and places the rail and marker on the same x-coordinate, but no rendered screenshot exists.
  Impact: pixel-level spacing or density may still differ from the reference.
  Fix: capture desktop and mobile populated Journey states and compare them together with the supplied sources.

## Comparison history

- Initial Phase 2 comparison: blocked because implementation capture was unavailable.
- Refinement pass: source issues were addressed structurally; visual comparison remains blocked for the same capture limitation.
- Mobile density pass: card borders moved to the desktop breakpoint, mobile padding/height/image width reduced, and successful save toasts removed; rendered comparison remains blocked.

## Implementation checklist

- Capture populated Journey at desktop and mobile widths.
- Verify year grouping uses conclusion year and remains reverse chronological.
- Test add/edit image selection, explicit cover choice, and return to Journey.
- Test the linked-Work horizontal row with keyboard and touch scrolling.
- Check console errors and focus states.

final result: blocked
