# Security baseline

- Validate untrusted data at HTTP, WebSocket, file, and third-party boundaries.
- Enforce tenant and resource authorization server-side after authentication.
- Keep secrets server-only, narrowly scoped, rotatable, and absent from logs,
  browser storage, build artifacts, screenshots, and agent prompts.
- Use synthetic fixtures for evidence and audit privileged or externally visible actions.
- Treat deployment, feedback, and coding-agent credentials as separate roles.

Security-sensitive changes require focused authorization and negative-path tests.
