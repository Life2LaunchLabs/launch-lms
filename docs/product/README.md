# Product system of record

`map/*.json` is the canonical, diffable Launch LMS product map. It preserves the
stable Group → Goal → Activity → Step hierarchy, lifecycle state, health,
acceptance criteria, implementation references, verification, signoff, and
tombstones formerly stored in productOS SQLite.

Run `./scripts/agent product` to validate IDs, relationships, ordering, states,
and code/test/document references and to check `index.md`. Edit the group file
that owns the affected outcome; never recycle permanent IDs or delete sunset or
removed outcomes to make the map look cleaner.

The operations platform may index and present this data, but changes are made by
pull request here. Its database is a cache, not product authority.

`feedback-policy.yaml` owns Launch-specific privacy, grouping, communication,
attachment, BOT-linking, and resolution rules consumed by the generic platform.
The local and Symphony-compatible operating flow is documented in
[feedback operations](feedback-operations.md).
