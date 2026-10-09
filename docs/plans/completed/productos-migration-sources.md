# productOS migration source ledger

The repository-owned product map was exported from
`productOS/workspaces/launch-lms/product.db` on 2026-09-15. Its source digest,
entity counts, lifecycle distribution, acceptance count, relationship count, and
reference count are preserved in `docs/product/manifest.json`. The split group
files retain every exported field, including source metadata and tombstones.

Legacy discovery sources were handled as follows:

| Source | Durable destination | Disposition |
| --- | --- | --- |
| `PRODUCT_ACTIVITY_HIERARCHY.md` | `docs/product/map/*.json` and generated `docs/product/index.md` | Migration reference; superseded by schema-validated map |
| `user-story-map.yaml` | Product-map hierarchy, acceptance and traceability fields | Migration reference; superseded by schema-validated map |
| `CLAUDE.md` | `ARCHITECTURE.md`, `AGENTS.md`, and executable repository inspection | Useful system facts retained; session-specific/duplicated instructions are not canonical |
| `TODO.md` | Jira Idea intake and existing product-map context | Raw owner ideas remain source material until separately formalized; they are not silently promoted to commitments |
| `scripts/docs/` and `design-qa.md` | `docs/design/README.md` index | Existing task evidence remains in place and indexed; move records only when doing so preserves links and provenance |

The original SQLite database must remain in the read-only productOS archive until
the platform retirement gate confirms exact parity. It is not required by a clean
Launch LMS checkout or by active agent workflows.
