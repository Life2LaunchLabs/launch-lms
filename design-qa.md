# Flow editor design QA

- Source visual truth: four user-provided hand-drawn flow-editor/sidebar sketches plus three implementation screenshots attached in the conversation; no local source-image paths were exposed to the workspace.
- Implementation screenshot: unavailable.
- Intended viewport: desktop activity editor, responsive width; exact viewport not captured.
- Latest source pixels: 900 × 1600 conversation attachment.
- Implementation pixels / CSS size / density: not captured.
- State: Flow tab with the shared variable-path picker, friendly hierarchical variable labels, local and user-profile variables, split-local sortable rule branches, explicit structural joins, junction-targeted orthogonal connections, equal-height parallel stacks, fixed-width leaf stacks, left-aligned continuation chunks, shared finish, and a single-branch projected editor sidebar.

**Findings**

- [P1] Browser-rendered comparison is unavailable.
  Location: activity editor Flow tab.
  Evidence: the source sketch was visible in the conversation, but this session has no callable in-app browser or screenshot capture surface for the authenticated editor route.
  Impact: layout, overflow, hover affordances, drag feedback, rule-chip sizing, and warning-glow behavior cannot be visually certified from rendered evidence.
  Fix: open the authenticated activity editor in an available browser, capture the Flow tab at the same desktop state, and compare it with the source sketch in one visual input.

**Open Questions**

- None in the implemented interaction model; only rendered visual verification remains.

**Implementation Checklist**

- Capture the Flow tab with at least one numeric split and three rule columns at desktop width.
- Verify the 280px stacks remain left-aligned and newly added rules appear at the right edge.
- Test page-card reorder within a stack and moves between the root, populated rule stacks, and empty rule stacks.
- Verify measured connectors run from the split block to every rule chip and from every stack endpoint to its selected page or the shared Finish block.
- Test changing an already-connected endpoint with the inline `Connected to…` control, plus the junction menu, inline rule editing, duplicate-rule warning, forward-reference warning/glow, loose-end connection, and leave warning.
- Verify the split picker matches the editor sidebar picker for typing, folder traversal, binding, clearing, and creating a custom variable.
- Verify a local multiple-choice question and a global multiple-choice variable both show one `is` operator and a single-option dropdown populated from their configured choices.
- Pick up a connection from a final page’s add menu, then connect it to Finish and to between-page junctions at the beginning and middle of another stack; confirm the join replaces the clicked boundary.
- Confirm there are no `Connected to…` pills: only the final page’s always-visible add menu offers Connect.
- While connecting, verify cards and drag handles remain visually unchanged, the old connection disappears, a live dashed orthogonal connector follows the pointer, valid existing junction nodes remain visible without hover, invalid junctions remain hidden, and clicking anywhere else cancels.
- Verify valid connection targets use the ordinary junction appearance with only a violet hover state, connected stack-end junctions return to hover-only visibility, and loose stack-end junctions stay visible.
- Verify every final stack menu includes `Complete activity` and selecting it rewires that stack directly to the unique finish block.
- Compare unequal parallel stacks: the shorter columns must stretch to the tallest endpoint, keep a straight vertical trunk through the empty space, and merge only below the shared row.
- Verify all persistent and in-progress connections use horizontal/vertical segments with rounded corners rather than Bézier curves.
- Reload directly into a flow containing a split and merge; confirm the explicitly sized connector canvas renders split-to-rule and branch-to-merge connectors on the initial frame without requiring a drag or connection interaction.
- Pick up one input to a two-input merge and confirm the now-redundant merge marker disappears immediately while the remaining input and continuation collapse into one stack.
- On a stretched branch, hover anywhere along the empty vertical lane and confirm the hidden endpoint control appears at its bottom.
- Verify ordinary between-page gaps are compact, with the junction control overlaying the neighboring card edges instead of reserving its full 24px height.
- Verify stack endpoint controls sit immediately below the final page and before any stretch lane; during connection pickup, the stretch line disappears and the live route begins at the endpoint control.
- Verify a path connected directly to Activity Complete renders no empty placeholder stack, while its invisible region still accepts a dropped page.
- Verify page cards omit ordinal numbers, show only `Video`, `Info`, or `Question`, and place the drag handle on the left.
- Drop a page near the bottom of every stretched lane and confirm the full lane participates in the stack droppable.
- Open the split picker and verify `This Activity` is first, local questions appear directly beneath it without page names, completed folders render as muted `Folder / ` prefixes, and highlighted Tab completion has a subtle inline suffix.
- Confirm the split picker offers no add-folder or add-variable actions and reports no match for unknown variables.
- Add a split within one branch of another split and verify the nested chunk expands its parent branch width, shifts sibling columns right, and leaves the ancestor merge/continuation owned by the ancestor chunk.
- Compare the split block plus its connector/rule row against two page cards and confirm their vertical footprints are visually equivalent.
- Drag a rule chip across parent and nested split rows; confirm only its own split row exposes a drop target and the branch cannot leave its split. Then reorder it within that row and confirm its page subtree reappears intact.
- Verify an empty path between consecutive joins appears as one compact node rather than a `Drop a page here` card.
- Connect a nested skip path to a join below its ancestor merge and confirm the connector exits the current chunk cleanly without pulling the lower continuation into the nested branch.
- Leave the Flow tab idle after a hard reload and confirm connectors remain visible through initial layout settling without requiring interaction.
- Confirm the connector layer is isolated above the canvas surface, reports a non-zero `data-flow-connector-count`, and remeasures on first intersection, page show, and tab visibility changes.
- Enter Flow from Editor and Settings repeatedly; confirm the connector layer mounts only after two visible layout frames and every connector is present before any connection pickup.
- Load an older flow containing zero- or one-input structural joins and confirm they normalize away immediately without leaving visible merge markers.
- Confirm a real multi-input merge has no standalone hollow-circle marker; its rounded connector convergence is the only visual representation of the merge.
- Confirm an empty flow path is represented by the ordinary visible add junction, and that its menu can insert a page or split directly at that boundary.
- In the editor sidebar, verify each split shows only its final variable name and one active path title between bounded previous/next arrows; the first path has no previous action, the last has no next action, and switching paths slides in the newly selected stack.
- Confirm split surfaces and dividers bleed through the sidebar's outer content padding, nested splits increase surface elevation, and the shared continuation returns to the parent surface after the merge.
- Select an empty split path in the editor sidebar and confirm there is no empty-stack dot, placeholder, or explanatory card.
- Drag pages between all simultaneously visible root, selected-branch, nested-branch, and post-merge sidebar stacks; confirm the same graph move semantics as the Flow tab.
- After a merge, verify the single continuation stack begins at the left edge; drag the last pre-merge page between columns and confirm the continuation remains in its own lower vertical chunk.
- Connect B after A in an A→C stack and verify A, B, and C all remain present, with an inert join between the two input stacks and the distinct C continuation stack.
- Move B to a different target and verify the abandoned one-input join collapses back into a direct A→C stack without deleting either side.
- Drag default and conditional rule chips left and right; confirm their page stacks collapse during the drag and reappear in the chosen order without changing rule evaluation.
- Enter connection mode and confirm the browser console stays clear of `@hello-pangea/dnd` missing drag-handle setup errors.
- Compare typography, spacing/layout rhythm, colors/tokens, icon rendering, and copy against the sketch and existing page sidebar.

**Follow-up Polish**

- Defer P3 polish until the browser comparison is available.

**Comparison History**

- No visual iteration was possible because the implementation screenshot could not be captured.

final result: blocked
