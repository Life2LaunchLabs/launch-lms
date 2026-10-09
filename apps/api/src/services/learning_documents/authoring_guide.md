# Launch LMS activity authoring guide

An **activity** is one step of a badge's learning path. It is a sequence of
**pages** a learner works through on a phone-sized card, optionally routed by a
branching **flow**. Activities live inside a badge **version**: only draft
versions can be edited; publishing a draft is done by an admin in Launch LMS.

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
    "required": true,
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

Multiple choice (`categorized_multi_select` adds `label` and `categories`):

```json
{ "id": "blk_q1", "type": "question", "kind": "multiple_choice", "design": { "width": 100, "align": "left" },
  "content": { "options": [ { "id": "opt_make", "text": "Making things" }, { "id": "opt_help", "text": "Helping people" } ] },
  "scoring": { "mode": "completion", "points": 1 },
  "completion": { "min_selections": 1, "max_selections": 1 } }
```

For a graded question use `"scoring": { "mode": "points", "points": 1, "correct_option_ids": ["opt_make"] }`.

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
Button that jumps to another page: `{ "type": "button", "content": { "label": "Show me", "destination_page_uuid": "new-examples" } }`.

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
