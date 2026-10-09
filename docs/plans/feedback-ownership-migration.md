# FEED ownership migration gate

Existing FEED issues use the `launchlms.feedback` Jira property with numeric app
user and organization IDs. The external operations surface accepts only opaque
HMAC identities. The app, while it still holds the FEED credential and database
access, must add a second `launch-operations` property to each legacy issue.

The repository command is `apps/api/scripts/migrate_feedback_ownership.py`.
Its default mode is audit-only. The protected infra **Migrate FEED ownership**
workflow runs it in a short-lived container from the exact deployed unstable application image,
under the shared deployment lock; do not copy the app database or subject
secret into the control plane. The workflow obtains the subject secret from the
protected unstable GitHub Environment for this operation only. It also requires
`LAUNCHLMS_FEEDBACK_JIRA_BASE_URL`, `LAUNCHLMS_FEEDBACK_JIRA_EMAIL`, and
`LAUNCHLMS_FEEDBACK_JIRA_API_TOKEN` as secrets in that Environment. Use the
least-privilege FEED identity, not a delivery or full-access Jira token.

1. Keep the old feedback API and Jira credentials enabled. Deploy an unstable
   candidate containing this command.
2. Run the workflow in `audit` mode. Record its issue count and digest with the
   deployed app SHA. Investigate any missing legacy property, user/organization,
   UUID mismatch, or conflicting platform property; audit stops without writes.
   A deleted user's conversation may be preserved using its original legacy
   `user_<UUID>` value only if its organization still resolves and no current
   user has claimed that UUID. Noncanonical pre-UUID values receive a distinct,
   issue-specific tombstone identity instead, which cannot match a login. The
   original property remains for provenance; the user is not restored or granted access.
3. Compare the count to an independently captured FEED parity inventory.
   Do not treat a zero count or a successful command alone as parity.
4. Run `apply` with that exact count and digest. The command re-audits before
   writing, checks ownership again on every issue, and verifies Jira's readback.
   Re-running is safe: matching existing platform properties are skipped.
5. Run `audit` again and require `already_migrated == issues`, the same digest,
   and representative tester-history access through the hidden external surface.
6. Migrate per-user unread markers separately. This command deliberately does
   not copy application user details into the platform database.

The legacy Jira property, comments, attachments, statuses, and BOT links are
left untouched. Never print the HMAC secret or raw user/organization IDs in
workflow logs. Do not remove the old credentials or routes until the complete
feedback parity gate, including unread markers and browser behavior, passes.

## Ownership-property execution record — 2026-09-17 UTC

- Unstable application commit: `a26e9598f58b4d6f6c2298bef14edd2473f5b68a`.
  Deployed image digest: `sha256:210b97e0e6eb5d64a96cb176bab2466eecd05b9caff84635635681ccbc470f84`.
- Independent read-only inventory: 7 FEED issues, 7 feedback labels, 7 legacy
  properties. One deleted-user row (`FEED-1`) had a noncanonical legacy ID and
  received an issue-specific, non-login tombstone owner; its original property
  remains in Jira. Evidence: [diagnostic run](https://github.com/Life2LaunchLabs/launch-lms-infra/actions/runs/35244173589).
- [Pre-write audit](https://github.com/Life2LaunchLabs/launch-lms-infra/actions/runs/35246456683):
  7 issues, 0 already migrated. Approved ownership digest:
  `1563e078c631bc9b22c16a242f6e03a45a940d485b2e01ca0a72d0616c67b32d`.
- [Guarded apply](https://github.com/Life2LaunchLabs/launch-lms-infra/actions/runs/35246713290):
  re-audited the same count/digest and wrote 7 platform properties with Jira
  readback. [Post-write audit](https://github.com/Life2LaunchLabs/launch-lms-infra/actions/runs/35246916738):
  7 already migrated and the identical digest.

This verifies ownership metadata only. Unread markers, representative history,
attachments, replies, admin workflow, and the external surface still require
parity testing before unstable cutover or removal of old app credentials/routes.
