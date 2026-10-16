# Launch LMS activity authoring guide

An **activity** is the content of a plan template's activity step. It is a
sequence of **pages** a learner works through on a phone-sized card, optionally
routed by a branching **flow**. It is edited in place: a save reaches every
learner playing it.

## Document shape

```json
{
  "format": "launch-lms.activity",
  "format_version": 1,
  "activity": {
    "activity_uuid": "learning_activity_…",
    "title": "Career interests",
    "description": "",
    "icon": null,
    "thumbnail_image": "",
    "settings": { "grading": { "minimum_score_percent": 70 }, "flow": { … } }
  },
  "pages": [ { "page_uuid": "learning_page_…", "page_type": "standard", "title": "Welcome", "required": true,
               "content": { "version": 2, "blocks": [ … ] }, "design": {}, "scoring": {}, "completion": {} } ]
}
```

Always start from the document returned by `get_activity` and send it back
whole. Keep every existing `page_uuid` and block `id` you are not deleting.

## Pages and ids

- Page order in the array is the default order learners see.
- New pages get a short placeholder id such as `new-reflection`; you may use it
  anywhere a page is referenced (flow nodes, buttons, variant sources, answer
  keys). It is replaced by a real uuid when saved.
- To add an activity, add an objective with `"type": "activity"` to its plan
  template and save the template; `list_activities` then shows the new
  activity's uuid. To copy an activity, read the source with `get_activity`
  and save its pages over the new one, giving each page a placeholder id.
- Removing a page that learners have answered is refused (it would delete
  their work). Retire it instead: set `"required": false` and route the flow
  around it.
- Block ids must be unique within a page (`blk_` + 8 hex characters is the
  house style, e.g. `blk_3fa9c2d1`). Option and input ids must be unique within
  their question.
- A page may contain at most one question block when it uses variants.

## Blocks

Text (Tiptap JSON nodes):

```json
{ "id": "blk_a1b2c3d4", "type": "text", "design": { "width": 100, "align": "left" },
  "content": { "nodes": [
    { "type": "heading", "attrs": { "level": 1 }, "content": [ { "type": "text", "text": "What lights you up?" } ] },
    { "type": "paragraph", "content": [ { "type": "text", "text": "Pick the one that fits best." } ] } ] } }
```

Insert an earlier answer or a profile variable inline with a `displayBinding`
node: `{ "type": "displayBinding", "attrs": { "binding": { "source": "answer", "path": "<page>.result.questions.<block>.inputs.<input>.text", "fallback": "your idea" } } }`.

Multiple choice (`categorized_multi_select` adds `label` and `categories`). A
choice question is either **scored** or a **survey** ("variable" mode):

```json
{ "id": "blk_q1", "type": "question", "kind": "multiple_choice", "design": { "width": 100, "align": "left" },
  "content": { "options": [ { "id": "opt_make", "text": "Making things" }, { "id": "opt_help", "text": "Helping people" } ] },
  "scoring": { "mode": "off", "points": 0, "correct_option_ids": [] },
  "completion": { "min_selections": 1, "max_selections": 1, "question_mode": "variable" } }
```

Scored: `"scoring": { "mode": "points", "points": 1, "score_policy": "select_all", "correct_option_ids": ["opt_make"] }`
with `"question_mode": "scored"`. A scored question with no correct options can
never earn its points, so a graded activity containing one can never be passed.
Allow several answers with `max_selections` > 1.

Options can come from a source instead of the document:
`"options_source": { "kind": "goal_templates", "limit": 3 }` lists the plans a learner can
start their goal from (top matches, with "See more" to search). Leave `options` empty and
write the pick with `"variable_bindings": { "selected": [ { "target": "goal.template" } ] }`.
Activities run in a goal's launch flow may write `goal.title`, `goal.why`, `goal.size`,
`goal.starting_point`, `goal.coach_cadence` and `goal.template`.

Text response:

```json
{ "id": "blk_q2", "type": "question", "kind": "text_input",
  "content": { "inputs": [ { "id": "in_why", "label": "Why?", "placeholder": "", "variant": "long_answer", "input_type": "text" } ] },
  "scoring": { "mode": "completion", "points": 1 },
  "completion": { "inputs": { "in_why": { "required": true, "min_words": 5, "max_words": 0, "points": 1 } } } }
```

Use `"scoring": { "mode": "manual" }` when a staff member should grade it.
Image upload: `{ "kind": "image_upload", "content": { "label": "Photo of your project" }, "scoring": { "mode": "manual", "points": 1 }, "completion": { "required": true } }`.

Image: `{ "type": "image", "content": { "src": "https://…", "alt": "…" }, "design": { "height": 220, "fit": "cover" } }`.
Buttons: a `continue` button completes the page like the Continue action, and
the flow can route on which one was pressed (see below):
`{ "id": "btn_more", "type": "button", "content": { "label": "Show me more", "action": "continue" } }`.
A `revisit` button jumps back to a page that comes earlier on the route:
`{ "type": "button", "content": { "label": "Back to the intro", "action": "revisit", "revisit_page_uuid": "new-intro" } }`.

Story blocks show numbers, words and achievements with their own motion:
`{ "type": "stat", "content": { "items": [ { "value": 12, "label": "steps done" } ] } }` (up to 4, numbers count up),
`{ "type": "quote", "content": { "text": "…", "attribution": "Why you started" } }`,
`{ "type": "chart", "content": { "kind": "bars", "values": [1, 3, 2], "labels": ["Oct 1", "Oct 8", "Oct 15"] } }` and
`{ "type": "medal", "content": { "title": "Goal complete", "subtitle": "…", "image": "" } }`.
A stat item, quote or chart can read a variable through `binding` instead. Activities run inside a
goal can read `goal.title`, `goal.why` and `goal.stats.steps_done`, `.weeks`, `.decisions`,
`.stages_done` and `.weekly` (steps done each week, for a chart).

## Design

Every activity plays full screen; these make it feel alive. Use them with
intent: one scene or celebration where it lands, not on every page.

- Page background: `"design": { "background": { "color": "#0f172a", "gradient_to": "#1e3a8a", "scene": "starfield", "intensity": "medium" } }`.
  Scenes: `starfield`, `aurora`, `drift`, `confetti` (or omit). Text turns light on dark colours.
- `"design": { "celebrate": true }` bursts confetti when the page opens (a finish line, a milestone).
- `"design": { "auto_advance_ms": 6000 }` moves the page on by itself, story style:
  learners tap to skip or go back and hold to pause; a page with questions waits for its answers.
- Activity defaults in `settings.design`: `"background"` (same shape, a page's own replaces it),
  `"progress": "segments"` (one segment per page; timed pages use segments anyway), and
  `"exit": { "label": "Save for later", "confirm": "Leave now?", "to_page_uuid": "p9" }`
  (no label shows a plain X; `to_page_uuid` jumps ahead to that page if it is still on the route, else the activity closes).
- Block design: `"entrance": "rise" | "fade" | "none"` (blocks rise in, staggered, by default);
  a continue button with `"placement": "footer"` sits beside Continue at the bottom;
  a choice question's `"style": "list" | "pills" | "scale" | "cards"` (options may carry
  `"icon"` (an emoji) and, for cards, `"description"`; a scale labels its two ends with the first and last option).

## Branching flow

Without `settings.flow` pages run in array order. A flow is an acyclic graph:

```json
{ "version": 1, "entry": "page:p1",
  "nodes": [ { "id": "page:p1", "type": "page", "page_uuid": "p1" },
             { "id": "page:p2", "type": "page", "page_uuid": "p2" },
             { "id": "page:p3", "type": "page", "page_uuid": "p3" },
             { "id": "complete", "type": "complete" } ],
  "edges": [ { "from": "page:p1", "to": "page:p2", "priority": 10,
               "condition": { "op": "contains", "left": { "source": "answer", "key": "p1.result.option_ids" }, "right": "opt_make" } },
             { "from": "page:p1", "to": "page:p3", "priority": 0 },
             { "from": "page:p2", "to": "complete", "priority": 0 },
             { "from": "page:p3", "to": "complete", "priority": 0 } ] }
```

Rules: exactly one `complete` node; every node reachable from `entry`; every
required page in the flow; a node with several outgoing edges needs exactly one
edge without a condition (the default) and distinct priorities (higher is
tried first); a condition may only reference questions answered before it.
`split` and `join` nodes route without showing a page.

To send each button somewhere different, add edges from the button's page
conditioned on `<page_uuid>.button`, e.g.
`{ "from": "page:p1", "to": "page:p3", "priority": 1, "condition": { "op": "eq", "left": { "source": "answer", "key": "p1.button" }, "right": "btn_more" } }`,
plus the default edge for every other button.

Answer keys: single-question page `<page>.result.option_ids`; per question
`<page>.result.questions.<block>.option_ids` or
`<page>.result.questions.<block>.inputs.<input>.text`. Variable keys look like
`user.details.variables.<key>` (see `list_variables`).

## Variants

A page can swap its blocks depending on an earlier question:
`"variants": { "source": { "page_uuid": "p1", "block_id": "blk_q1" }, "overrides": { "opt_make": { "blocks": [ … ] }, "correct": { "blocks": [ … ] } } }`.

## Workflow

1. `get_activity` → edit the document → `validate_activity` until it has no errors.
2. `preview_activity` with the edited document so the admin can click through it.
3. `save_activity` with the `etag` you read. A 409 means someone else changed the
   activity: merge your edits into the returned current document and retry.
