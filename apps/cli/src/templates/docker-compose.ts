import { APP_IMAGE, POSTGRES_IMAGE, POSTGRES_AI_IMAGE } from '../constants.js'
import type { SetupConfig } from '../types.js'

/**
 * Generates docker-compose.yml with unique deployment ID.
 * External database/redis excluded. Auto SSL uses Caddy instead of nginx.
 */
export function generateDockerCompose(config: SetupConfig, appImage?: string): string {
  const image = appImage || APP_IMAGE
  const id = config.deploymentId
  const useLocalDb = !config.useExternalDb
  const useLocalRedis = !config.useExternalRedis

  const deps: string[] = []
  if (useLocalDb) deps.push('      db:\n        condition: service_healthy')
  if (useLocalRedis) deps.push('      redis:\n        condition: service_healthy')

  const appDependsOn = deps.length > 0
    ? `    depends_on:\n${deps.join('\n')}`
    : ''

  const proxyService = config.autoSsl
    ? `
  caddy:
    image: caddy:2-alpine
    container_name: launch-lms-caddy-${id}
    restart: unless-stopped
    ports:
      - "80:80"
      - "\${HTTP_PORT:-443}:443"
    volumes:
      - ./extra/Caddyfile:/etc/caddy/Caddyfile:ro
      - launch-lms_caddy_data_${id}:/data
      - launch-lms_caddy_config_${id}:/config
    depends_on:
      launch-lms-app:
        condition: service_healthy
    networks:
      - launch-lms-network-${id}
    healthcheck:
      test: ["CMD-SHELL", "wget --quiet --tries=1 --spider http://localhost:80/ || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
`
    : `
  nginx:
    image: nginx:alpine
    container_name: launch-lms-nginx-${id}
    restart: unless-stopped
    ports:
      - "\${HTTP_PORT:-80}:80"
    volumes:
      - ./extra/nginx.prod.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      launch-lms-app:
        condition: service_healthy
    networks:
      - launch-lms-network-${id}
    healthcheck:
      test: ["CMD-SHELL", "wget --quiet --tries=1 --spider http://localhost/ || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
`

  const dbImage = config.useAiDatabase ? POSTGRES_AI_IMAGE : POSTGRES_IMAGE
  const dbService = useLocalDb
    ? `
  db:
    image: ${dbImage}
    container_name: launch-lms-db-${id}
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - POSTGRES_USER=\${POSTGRES_USER:-launch-lms}
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD:-launch-lms}
      - POSTGRES_DB=\${POSTGRES_DB:-launch-lms}
    volumes:
      - launch-lms_db_data_${id}:/var/lib/postgresql/data
    networks:
      - launch-lms-network-${id}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-launch-lms}"]
      interval: 5s
      timeout: 4s
      retries: 5
`
    : ''

  const redisService = useLocalRedis
    ? `
  redis:
    image: redis:7.2.3-alpine
    container_name: launch-lms-redis-${id}
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - launch-lms_redis_data_${id}:/data
    networks:
      - launch-lms-network-${id}
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 4s
      retries: 5
`
    : ''

  const volumeEntries: string[] = []
  if (config.autoSsl) {
    volumeEntries.push(`  launch-lms_caddy_data_${id}:`)
    volumeEntries.push(`  launch-lms_caddy_config_${id}:`)
  }
  if (useLocalDb) volumeEntries.push(`  launch-lms_db_data_${id}:`)
  if (useLocalRedis) volumeEntries.push(`  launch-lms_redis_data_${id}:`)

  const volumesSection = volumeEntries.length > 0
    ? `volumes:\n${volumeEntries.join('\n')}`
    : ''

  return `name: launch-lms-${id}

services:
  launch-lms-app:
    image: ${image}
    container_name: launch-lms-app-${id}
    restart: unless-stopped
    env_file:
      - .env
    environment:
      # HOSTNAME needs to be set explicitly for the container
      - HOSTNAME=0.0.0.0
      - LAUNCHLMS_API_URL=http://localhost:9000
${appDependsOn}
    networks:
      - launch-lms-network-${id}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
${proxyService}${dbService}${redisService}
networks:
  launch-lms-network-${id}:
    driver: bridge

${volumesSection}
`
}
