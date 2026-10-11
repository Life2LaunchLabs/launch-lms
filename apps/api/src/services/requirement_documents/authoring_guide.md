# Requirement framework authoring guide

A requirement framework is a hierarchy of requirements (standards, competencies,
graduation criteria) that learners are enrolled in. Plan template objectives
link to requirement nodes; when a learner completes a linked objective in a
live plan, the requirement is credited. Two objectives in different templates
that "do the same thing" link to the same node.

```json
{
  "format": "launch-lms.requirement-framework",
  "format_version": 1,
  "framework": {
    "name": "Work-Based Learning Standards",
    "description": "",
    "levels": [
      {"level_uuid": "requirement_level_…", "name": "Domain", "code_style": "upper_alpha", "metadata_fields": []},
      {"level_uuid": "requirement_level_…", "name": "Standard", "code_style": "decimal",
       "metadata_fields": [{"field_uuid": "metadata_field_…", "name": "Hours", "type": "text", "required": false}]}
    ]
  },
  "nodes": [
    {"node_uuid": "requirement_node_…", "parent_node_uuid": null, "title": "Professionalism"},
    {"node_uuid": "new-communication", "parent_node_uuid": "requirement_node_…", "title": "Communicates professionally",
     "metadata": {"metadata_field_…": "10"}}
  ]
}
```

## Versions

- A framework has numbered versions. The working version is a draft until it
  is published. Saving a document over a published version starts a new draft
  automatically; nothing learners are enrolled in changes until that draft is
  published.
- Publishing is a separate step (`publish_requirement_framework`). Do it only
  when the admin asks. Learners already enrolled stay on their version until
  an admin moves them in Launch LMS.

## Nodes

- `parent_node_uuid` builds the hierarchy; top-level nodes have none.
- Keep `node_uuid` for existing nodes: objectives link to it, and earned
  credit is recorded against it. Removing or replacing a linked node breaks
  those links (validation warns, with the objectives affected).
- New nodes omit `node_uuid`, or use a short placeholder their children can
  reference; placeholders are replaced with real ids on save.
- Siblings appear in document order.
- Only **leaf** nodes (nodes with no children) earn credit. Link objectives to
  leaves.

## Levels and codes

With `levels`, every depth of the hierarchy needs a level, and codes are
numbered automatically from each level's `code_style` (`upper_alpha` A, B…;
`lower_alpha`; `decimal` 1, 2…; `upper_roman`; `lower_roman`), joined with
dots (e.g. `A.1.ii`). A level's `metadata_fields` are extra values each node
at that depth records in `metadata` (keyed by `field_uuid`); `required` fields
must be filled.

Without levels the framework is a flat or freely nested list and `code` is
written by hand.
