# Security baseline

Hosted tenant-cookie isolation and cross-host transfer:
[host-only handoff](host-only-handoff.md). Its browser and legacy-cookie gates
remain open until explicitly verified.

- Validate untrusted data at HTTP, WebSocket, file, and third-party boundaries.
- Enforce tenant and resource authorization server-side after authentication.
- Keep secrets server-only, narrowly scoped, rotatable, and absent from logs,
  browser storage, build artifacts, screenshots, and agent prompts.
- Use synthetic fixtures for evidence and audit privileged or externally visible actions.
- Treat deployment, feedback, and coding-agent credentials as separate roles.

Security-sensitive changes require focused authorization and negative-path tests.

Stored files (`/content/...`): who may open each one is decided in
`apps/api/src/services/content_access.py` for both the S3 and filesystem routers.
Organization content and profile images are public; learners' uploads open only for
the owner, staff in an organization they belong to, superadmins, people sharing one of
their plans, or anyone when the learner put the file on their profile or published
public portfolio. Everyone else gets 404, and private files are never sent with a
public cache header.
