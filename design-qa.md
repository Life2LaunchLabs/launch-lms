# BOT-156 Hub companion design QA

> Owner review update, 9 September 2026: the app companion frame, unified header, context status, and group-plan awareness were revised after the evidence below. At the owner's request, those follow-up visuals are being reviewed directly in the running product rather than through another agent screenshot pass.

## Comparison target and evidence

- Desktop source: `scripts/docs/BOT-82-companion/concepts/D01.png`, 1536×1024. The owner described this as a rough, non-authoritative concept.
- Desktop implementation: `scripts/docs/BOT-82-companion/evidence/desktop-final.png`, 1440×960 CSS viewport at device scale 1.
- Mobile source: `scripts/docs/BOT-82-companion/concepts/M02.png`, 256×547 concept crop.
- Mobile implementation: `scripts/docs/BOT-82-companion/evidence/mobile-final.png`, 390×844 CSS viewport at device scale 1.
- Both source/implementation pairs were opened together in the final comparison input. The concepts and captures have equivalent aspect ratios but different densities, so the comparison judges composition and interaction hierarchy rather than pixel identity.
- Focused review covered the plan title/objective, page-context block, transcript, and sticky composer because those details carry the first-release interaction.

## Findings and iterations

### Iteration 1 — blocked

- **P1 · Plan landmark:** the desktop implementation rendered the plan header as an empty purple bar. This removed the plan title that anchors the mockup. The mount-only scale animation was removed so the native header and title are immediately present after route changes.
- **P1 · Selected-object context:** opening the launcher collapsed the selected objective, so the companion lost “About: Compare two design roles.” The launcher is now an exempt product control, and selection lookup supports objectives nested under phases.
- **P2 · Mobile keyboard recovery:** Escape failed after a conversation load removed the focused history button. Escape handling now closes the active drawer even when focus temporarily returns to the document body.

### Iteration 2 — passed

The revised evidence shows the plan title, expanded selected objective, page and selected-object labels, grounded answer, receipt disclosure, and composer together. The same content adapts to a right-side mobile drawer with a deliberate app sliver and full-height conversation.

No P0, P1, or P2 visual issues remain. The concept uses a single condensed header row while the implementation preserves Hub's existing navigation row plus a small companion control row. That is an accepted P3 difference because it exposes both “Full Hub” and conversation navigation without inventing a second header system. The desktop mockup has more generous app width and larger typography because its source canvas is wider; the implementation retains usable plan controls at the requested 1440px verification viewport.

## Required fidelity surfaces

- **Fonts and typography:** the implementation uses Launch LMS's established font stack and weights. Plan title, phase label, objective hierarchy, transcript prose, metadata, and muted context labels remain legible at both viewports. The mobile conversation title truncates intentionally to preserve the action controls.
- **Spacing and layout rhythm:** desktop uses an approximately one-third companion and two-thirds framed app, matching the requested outside-app hierarchy. Mobile uses one dominant drawer with a narrow app sliver, sticky composer, safe-area padding, and no horizontal overflow. Borders, radii, and vertical spacing use existing Launch tokens.
- **Colors and visual tokens:** app surfaces use `background`, `card`, `muted`, and `border`; the existing plan accent remains the only strong color. Context and receipts use muted foregrounds without relying on color alone.
- **Image quality and asset fidelity:** these states contain only the existing Launch logo and icon-library controls. No mockup imagery, placeholder artwork, CSS drawing, or recreated brand asset was introduced.
- **Copy and content:** the current page, selected objective, saved-detail boundary, learner question, answer, and page-source receipt are explicit. The implementation adds precise privacy copy that the rough mockups did not specify.

## Interaction and accessibility evidence

- The exact composer DOM node and its draft survived Plans → Badges → Back while the companion stayed mounted.
- The selected plan/objective context returned after Back navigation.
- The mobile drawer closed with Escape and reopened without reloading the thread.
- The drawer makes the app inert while modal, traps Tab within the companion, restores focus on close, and supplies an accessible dialog label.
- The final browser pass reported no page errors.

## Remaining P3 iteration notes

- Consider consolidating the companion and conversation controls into one row after broader Hub navigation testing.
- The concept's objective resource card and target-progress treatment belong to separate Plans refinements and were not recreated for this read-only companion slice.

## Implementation checklist

- [x] Desktop composition compared with D01.
- [x] Mobile composition compared with M02.
- [x] P1/P2 findings fixed and recaptured.
- [x] Persistent navigation, context selection, drawer recovery, and console behavior verified in Chromium.

final result for captured iteration: passed; follow-up visual review: owner
