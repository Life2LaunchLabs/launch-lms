#!/usr/bin/env bash
set -euo pipefail
: "${IMAGE:?Image to test is required}"
: "${GITHUB_SHA:?Commit is required}"
cleanup() {
  docker rm -f launch-lms-ci-app launch-lms-ci-redis launch-lms-ci-db launch-lms-ci-embeddings >/dev/null 2>&1 || true
  docker network rm launch-lms-ci >/dev/null 2>&1 || true
}
# Refuse collisions before installing cleanup so a local developer's containers
# from another run can never be removed by this invocation.
for name in launch-lms-ci-app launch-lms-ci-redis launch-lms-ci-db launch-lms-ci-embeddings; do
  if docker container inspect "$name" >/dev/null 2>&1; then
    echo "Container $name already exists; finish that smoke run first." >&2
    exit 1
  fi
done
trap cleanup EXIT

# Verify build metadata
(
docker run --rm --entrypoint sh "${IMAGE}" -lc '
  test -f /app/build-info.json
  python3 -c "import json; from pathlib import Path; data=json.loads(Path(\"/app/build-info.json\").read_text());  assert data[\"commit_sha\"] == \"'${GITHUB_SHA}'\", data; assert data[\"alembic_head\"], data; print(json.dumps(data, indent=2))"
'

)

# Start disposable database
(
docker network create launch-lms-ci
docker run -d \
  --name launch-lms-ci-db \
  --network launch-lms-ci \
  -e POSTGRES_USER=launchlms \
  -e POSTGRES_PASSWORD=launchlms \
  -e POSTGRES_DB=launchlms \
  pgvector/pgvector:pg16
for _attempt in $(seq 1 60); do
  if docker exec launch-lms-ci-db pg_isready -U launchlms >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done
docker logs launch-lms-ci-db
exit 1

)

# Start local embedding service
(
docker run -d \
  --name launch-lms-ci-embeddings \
  --network launch-lms-ci \
  -p 127.0.0.1::11434 \
  ollama/ollama:0.33.3
embedding_port=$(docker port launch-lms-ci-embeddings 11434/tcp | sed 's/.*://')
for _attempt in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${embedding_port}/api/tags" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec launch-lms-ci-embeddings ollama pull all-minilm:33m
dimensions=$(curl -fsS "http://127.0.0.1:${embedding_port}/api/embed" \
  -H 'Content-Type: application/json' \
  -d '{"model":"all-minilm:33m","input":"personality assessment"}' \
  | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["embeddings"][0]))')
test "$dimensions" = "384"

)

# Run release migrations
(
docker run --rm \
  --network launch-lms-ci \
  -e LAUNCHLMS_AUTH_JWT_SECRET_KEY=ci-release-smoke-secret-key-32chars \
  -e COLLAB_INTERNAL_KEY=ci-release-smoke-internal-key \
  -e LAUNCHLMS_SQL_CONNECTION_STRING=postgresql+psycopg2://launchlms:launchlms@launch-lms-ci-db:5432/launchlms \
  --entrypoint sh \
  "${IMAGE}" \
  -lc 'cd /app/api && ./scripts/run_alembic_migrations.sh && uv run alembic current'

)

# Verify resource search storage
(
extension=$(docker exec launch-lms-ci-db psql -U launchlms -d launchlms -tAc "SELECT extname FROM pg_extension WHERE extname='vector'")
vector_type=$(docker exec launch-lms-ci-db psql -U launchlms -d launchlms -tAc "SELECT format_type(atttypid, atttypmod) FROM pg_attribute WHERE attrelid='resourcesearchdocument'::regclass AND attname='embedding'")
vector_index=$(docker exec launch-lms-ci-db psql -U launchlms -d launchlms -tAc "SELECT indexname FROM pg_indexes WHERE indexname='ix_resourcesearchdocument_embedding_hnsw'")
test "$extension" = "vector"
test "$vector_type" = "vector(384)"
test "$vector_index" = "ix_resourcesearchdocument_embedding_hnsw"

)

# Evaluate hybrid resource relevance
(
docker run --rm \
  --network launch-lms-ci \
  -e LAUNCHLMS_RESOURCE_EMBEDDING_URL=http://launch-lms-ci-embeddings:11434/api/embed \
  -e LAUNCHLMS_RESOURCE_EMBEDDING_MODEL=all-minilm:33m \
  --entrypoint sh \
  "${IMAGE}" \
  -lc 'cd /app/api && uv run python scripts/evaluate_resource_search.py --require-improvement'

)

docker run -d --name launch-lms-ci-redis --network launch-lms-ci redis:7-alpine

# Exercise the runtime, not only the migration container.
docker run -d --name launch-lms-ci-app --network launch-lms-ci \
  -e LAUNCHLMS_AUTH_JWT_SECRET_KEY=ci-release-smoke-secret-key-32chars \
  -e COLLAB_INTERNAL_KEY=ci-release-smoke-internal-key \
  -e LAUNCHLMS_SQL_CONNECTION_STRING=postgresql+psycopg2://launchlms:launchlms@launch-lms-ci-db:5432/launchlms \
  -e LAUNCHLMS_REDIS_CONNECTION_STRING=redis://launch-lms-ci-redis:6379/0 \
  -e LAUNCHLMS_INITIAL_ADMIN_EMAIL=smoke@example.org \
  -e LAUNCHLMS_INITIAL_ADMIN_PASSWORD=smoke-initial-password-123 \
  -e LAUNCHLMS_DOMAIN=localhost -e NEXT_PUBLIC_LAUNCHLMS_DOMAIN=localhost \
  -e LAUNCHLMS_INTERNAL_API_URL=http://localhost/api/v1/ \
  -e LAUNCHLMS_RESOURCE_EMBEDDING_URL=http://launch-lms-ci-embeddings:11434/api/embed \
  "$IMAGE"
for _attempt in $(seq 1 90); do
  if docker exec launch-lms-ci-app sh -c 'curl -fsS http://localhost/api/v1/health && curl -fsS http://localhost:8000/login >/dev/null && curl -fsS http://localhost:4000/health'; then
    # Exercise configured initial credentials and Redis-backed login controls.
    docker exec launch-lms-ci-app sh -c 'curl -fsS http://localhost/api/v1/auth/login --data-urlencode username=smoke@example.org --data-urlencode password=smoke-initial-password-123' > /dev/null
    exit 0
  fi
  sleep 2
done
docker logs --tail 100 launch-lms-ci-app
exit 1
