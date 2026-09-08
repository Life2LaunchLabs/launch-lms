**Source visual truth**

- User-attached square resource-card mockup from September 7, 2026.
- Desktop, light theme, three-resource carousel with the first resource expanded.
- The mockup is the current source of truth for the Hub resource carousel and authoritative card; earlier Mistral references still inform the compact Library tray only.

**Implementation evidence**

- No browser-rendered screenshot of the current implementation is available in this tool session.
- The most recent user screenshot predates this mockup-driven rebuild and cannot be used as post-fix evidence.

**Viewport and normalization**

- Target state: signed-in desktop Hub conversation, three resources in one carousel, first resource active, Notes selected.
- Source appears square; exact CSS viewport and device density are not available from the attachment metadata.
- Implementation dimensions and density cannot be normalized until a new rendered capture is supplied.

**Full-view comparison evidence**

- Blocked: there is no current implementation capture to place beside the source mockup.

**Focused region comparison evidence**

- Blocked for the same reason. The required focused regions are the compact carousel, resource summary/List-chip stack, and Notes/Reviews panel.

**Findings**

- [P1] Visual fidelity cannot yet be verified.
  - Location: Hub resource context.
  - Evidence: source mockup is available, but the implementation has no post-build browser capture.
  - Impact: typography, spacing, responsive wrapping, image crop, and overall density cannot be truthfully approved.
  - Fix: capture the current three-resource Notes state at the same desktop viewport and compare it alongside the source.

**Implemented source-directed changes awaiting visual evidence**

- Carousel cards are condensed to image, two-line title, and remove control; subtitles are removed.
- The expanded state is one cohesive card with a square image, linked title, rating row, description, inline List chips, tab switcher, and Notes/Reviews content.
- The upper-right action is one vertical-dots menu containing Share, explicit Add/Remove Library, and custom List actions; title and navigation arrows were removed.
- List chips and List rows use their configured color or gradient across the whole surface, with icon and label sharing the configured foreground color.
- Existing List chips reveal an X on hover/focus for direct removal; the plus circle remains the persistent add control.
- Notes use one quiet editable field and save on blur; the shared media picker supports choosing from the learner's Media Library or uploading a new image/PDF.
- Resource batches are transcript events: “You added” appears immediately before the associated user message and “Suggested” follows the assistant message that introduced the resources.
- The rating summary opens Reviews and focuses the learner's new review composer or existing review editor.
- Passive suggestion, display, chat selection, and card expansion remain ephemeral; only opening, List membership, Notes/media, reviews, or an explicit Library action save the resource.
- Library resource rows use the same compact vertical-dots action menu and remove a resource from the visible Library/List immediately when applicable.

**Required fidelity surfaces**

- Fonts and typography: code follows the mockup's compact hierarchy and two-line carousel titles; browser evidence pending.
- Spacing and layout rhythm: cohesive card and simplified action/divider structure implemented; browser evidence pending.
- Colors and visual tokens: Launch LMS card/muted/border tokens retained; configured List gradients/colors now cover whole items; browser evidence pending.
- Image quality and asset fidelity: real resource thumbnails remain in use with constrained square crops; browser evidence pending.
- Copy and content: “You added,” “Suggested,” Notes, Reviews, privacy, rating, and media actions implemented; realistic rendered data pending.

**Primary interactions requiring browser verification**

- Switch, collapse, and remove resources within both pending and historical carousels.
- Submit selected resources and confirm their carousel remains immediately above that user message.
- Receive later suggestions and confirm they form a separate labeled carousel.
- Open linked title, use both vertical-dots menus, add/remove Library and List membership, click the rating summary into the review composer, blur-save Notes, and choose/upload media.
- Confirm passive suggestion, display, selection, and expansion do not save; confirm open, List add, Notes/media, review, and explicit Add to Library do.
- Check keyboard focus, narrow-screen overflow, and browser console errors.

**Comparison history**

- Iterations 1–5 addressed the earlier Library and oversized-resource screenshots.
- Iteration 6 rebuilt the carousel/card composition from the new square mockup and incorporated the owner's follow-up simplification, List styling/removal, Media Library, autosave, and transcript-event direction.
- Iteration 7 consolidated resource actions into vertical-dots menus, made rating the entry to the review composer, and narrowed automatic Library membership to meaningful interactions.
- No post-iteration-7 rendered screenshot is available.

**Implementation checklist**

- Capture the current three-resource Notes state at the target desktop viewport.
- Place source and implementation in one comparison input.
- Resolve any remaining P0/P1/P2 typography, spacing, color, image, content, responsive, or interaction differences.
- Exercise the primary interactions and inspect the browser console.

final result: blocked
