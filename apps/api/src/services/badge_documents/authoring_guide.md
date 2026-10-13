# Launch LMS badge authoring guide

A **badge** is a credential an organization creates: its definition (name,
criteria, image, the Open Badges achievement type), its **Marketing** story
(what learners see in Discover and on the badge page) and its **listing**
(collection, public, offered to other organizations). How a learner earns it
lives elsewhere: in **plan templates** linked to the badge as its **ways to
earn** ("routes"). Starting a badge gives the learner their own plan from the
recommended route; finishing every step awards the badge.

## Document shape

```json
{
  "format": "launch-lms.badge",
  "format_version": 1,
  "badge": {
    "name": "Workplace Communicator",
    "description": "Communicates clearly and professionally at work.",
    "criteria": "Complete every step of the Workplace Communicator plan, including a reviewed mock meeting.",
    "about": "For students starting their first job or internship…",
    "image_url": "https://example.org/badge.png",
    "achievement_type": "Badge",
    "certificate_theme": "professional",
    "criteria_url": "",
    "issuer_name": "",
    "direct_issuance": true
  },
  "marketing": {
    "subtitle": "Speak up, write well, run a meeting",
    "estimated_time": "~3 hrs",
    "trust_line": "Free - start anytime - no pressure",
    "highlights": [
      { "title": "Clear emails", "body": "Writes concise, professional messages.", "media_url": "", "image_side": "left" }
    ]
  },
  "listing": { "collection_uuid": null, "public": true, "marketplace_listed": false }
}
```

- `description` and `criteria` are required to publish. Write `criteria` as
  what the learner must do, matching the plan template that earns it.
- `achievement_type`: Achievement, Badge, Award, Assessment, Certificate,
  CertificateOfCompletion, Certification, Competency or Course.
- `certificate_theme`: royal, tech, nature, geometric, vintage, waves, minimal,
  professional, academic or modern.
- Images and media are URLs: an `https://` URL or a `/content/...` path of an
  image already uploaded in Launch LMS. Uploading a file happens in the editor.
- `highlights` are the "What it proves" cards on the badge page, in order.

## Versions and publishing

The document you read is the badge's **working version**: its draft if it has
one, otherwise the live version. `save_badge` never changes a published
version: saving definition or Marketing changes over one starts a new draft
(`started_draft: true`). Learners see the change only after `publish_badge`.
The `listing` is not versioned and applies at once.

`publish_badge` publishes the draft with a semantic version and makes it live.
Omit `semantic_version` to take the next minor (or 1.0.0 for the first
release); `context.next_semantic_versions` lists the options. Use a **major**
version when the criteria change meaningfully: templates that require this
badge keep requiring the earlier major version until moved with
`update_template_badge_versions`. Publish only when the admin asks.

## Ways to earn

A badge with no route cannot be started by learners. To make one:

1. `create_plan_template` with the phases and objectives that earn it (use
   objective `type: "activity"` for interactive steps, then write their pages
   with `get_activity` / `save_activity`).
2. `set_badge_routes` with the full list of templates that earn it, one marked
   `recommended`.
3. `publish_badge` when the admin is ready.

Edits to a route template apply to learners who start the badge afterwards.

## Collections

Collections group badges in Discover and carry the creator's credibility
statement and endorsers. Find them with `list_badge_collections`; create or
edit one with `save_badge_collection`; put a badge in one through
`listing.collection_uuid`.

## Workflow

1. `list_badges` → `get_badge` (or start a new document).
2. Edit the whole document → `validate_badge` until it has no errors; read the
   warnings to the admin.
3. `create_badge` or `save_badge` with the `etag` you read. A 409 means someone
   else changed the badge: merge your edits into the returned current document
   and retry.
4. Point the admin to the `editor_url` to review the image and certificate.
