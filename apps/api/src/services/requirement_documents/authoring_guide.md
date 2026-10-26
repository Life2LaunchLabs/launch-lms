# Requirement framework authoring guide

A requirement framework is a hierarchy of requirements (standards, competencies,
graduation criteria). Plan template steps link to its requirements; when a
learner completes a linked step in a live plan, the requirement is credited.
Two steps in different plans that "do the same thing" link to the same
requirement, and either one counts.

```json
{
  "format": "launch-lms.requirement-framework",
  "format_version": 1,
  "framework": {
    "name": "Graduation readiness",
    "description": "",
    "numbering": "custom",
    "fields": [
      {"field_uuid": "metadata_field_…", "name": "Hours", "type": "number", "applies": "requirements", "required": false}
    ]
  },
  "nodes": [
    {"node_uuid": "requirement_node_…", "parent_node_uuid": null, "code": "SB3", "title": "Higher Education & Career Path Skills", "numbering": "decimal"},
    {"node_uuid": "new-higher-ed", "parent_node_uuid": "requirement_node_…", "title": "Higher education", "numbering": "lower_alpha"},
    {"node_uuid": "new-fafsa", "parent_node_uuid": "new-higher-ed", "title": "Apply for financial aid"},
    {"node_uuid": "requirement_node_…", "parent_node_uuid": null, "code": "CCL", "title": "Career Connected Learning",
     "numbering": "custom", "rule": {"kind": "any", "count": 2}},
    {"node_uuid": "new-ccl-aw", "parent_node_uuid": "requirement_node_…", "code": "CCL-AW", "title": "Career awareness",
     "metadata": {"metadata_field_…": 4}}
  ]
}
```

## Versions

- A framework has numbered versions. The working version is a draft until it
  is published. Saving a document over a published version starts a new draft
  automatically; nothing learners are tracked on changes until that draft is
  published.
- Publishing is a separate step (`publish_requirement_framework`). Do it only
  when the admin asks.
- A framework copied from the library as "use as is" is locked: it can't be
  saved or published, only used.

## Nodes

- `parent_node_uuid` builds the hierarchy; top-level nodes (categories, such as
  SB3, CCL and a school's own expectations) have none.
- Keep `node_uuid` for existing nodes: steps link to it, and earned credit is
  recorded against it. Removing or replacing a linked node breaks those links
  (validation warns, with the steps affected).
- New nodes omit `node_uuid`, or use a short placeholder their children can
  reference; placeholders are replaced with real ids on save.
- Siblings appear in document order.
- Only **leaf** nodes (nodes with no children) are requirements a step can
  count toward. Link steps to leaves.

## Numbering and codes

There are no levels. Each node with children picks how its children are
numbered with `numbering`; the framework's `numbering` does the same for the
top-level categories. The choices are `decimal` (1, 2, 3), `lower_alpha`
(a, b, c), `upper_alpha`, `lower_roman` (i, ii, iii), `upper_roman`, `custom`
(each child keeps the `code` written for it) and `none` (no code). Generated
codes join the parent's code with a dot, so under `SB3` with `decimal`, then
`lower_alpha`, the codes read `SB3.1`, `SB3.1.a`. The default is `custom`.

## When a group is met

A node with children is met when all of them are met, unless it has a `rule`:
`{"kind": "any", "count": 2}` means any 2 of its children. The count is between
1 and the number of children.

## Fields

`framework.fields` are extra values nodes record in `metadata`, keyed by
`field_uuid`: `type` is `text`, `number`, `link`, `date` or `boolean`;
`applies` is `all` nodes, `groups` (nodes with children) or `requirements`
(leaves); `required` fields must be filled on the nodes they apply to.

`framework.levels` is the old shape (one code style per depth). It is still
accepted and turned into numbering and fields, but write the shape above.
