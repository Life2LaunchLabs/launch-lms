# Reliability baseline

Releases are immutable, migration-first, health-checked, and promoted by digest
without rebuilding. Critical external integrations fail explicitly or degrade
without blocking unrelated product journeys.

Long-running work is idempotent and restart-safe. Logs identify the operation and
outcome without secrets. Verification uses disposable isolated dependencies. A
merge is not deployment evidence; record the verified deployed SHA.
