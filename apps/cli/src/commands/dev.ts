import { spawn, spawnSync, execSync, type ChildProcess } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import net from 'node:net'
import * as p from '../utils/prompt.js'
import pc from 'picocolors'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { isDockerInstalled, isDockerRunning } from '../services/docker.js'
import { checkDevEnv } from '../services/env-check.js'

const PROJECT_NAME = 'launch-lms-dev'
const DEV_LOCAL_HOST = 'localhost'
const DEFAULT_DEV_PUBLIC_HOST = '127.0.0.1.sslip.io'
const DEV_WEB_PORT = '3000'
const DEV_API_PORT = '1338'
const DEV_COLLAB_PORT = '4000'

const DEV_COMPOSE = `name: launch-lms-dev

services:
  db:
    image: pgvector/pgvector:pg16
    container_name: launch-lms-db-dev
    restart: unless-stopped
    environment:
      - POSTGRES_USER=launchlms
      - POSTGRES_PASSWORD=launchlms
      - POSTGRES_DB=launchlms
    ports:
      - "5432:5432"
    volumes:
      - launch_lms_db_dev_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U launchlms"]
      interval: 5s
      timeout: 4s
      retries: 5

  redis:
    image: redis:8.6.1-alpine
    container_name: launch-lms-redis-dev
    restart: unless-stopped
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - launch_lms_redis_dev_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 4s
      retries: 5

volumes:
  launch_lms_db_dev_data:
  launch_lms_redis_dev_data:
`

function findProjectRoot(): string | null {
  let dir = process.cwd()
  while (true) {
    if (
      fs.existsSync(path.join(dir, 'apps', 'api')) &&
      fs.existsSync(path.join(dir, 'apps', 'web'))
    ) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function getDevComposePath(root: string): string {
  const dotDir = path.join(root, '.launch-lms')
  if (!fs.existsSync(dotDir)) fs.mkdirSync(dotDir, { recursive: true })
  const composePath = path.join(dotDir, 'docker-compose.dev.yml')
  fs.writeFileSync(composePath, DEV_COMPOSE)
  return composePath
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function checkPortAvailable(port: number, host = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen(port, host)
  })
}

async function ensurePortsAvailable(ports: Array<{ port: number; label: string }>): Promise<void> {
  const unavailable: Array<{ port: number; label: string }> = []

  for (const spec of ports) {
    const ok = await checkPortAvailable(spec.port)
    if (!ok) unavailable.push(spec)
  }

  if (unavailable.length === 0) return

  p.log.error('Required dev ports are already in use.')
  for (const spec of unavailable) {
    p.log.error(`${spec.label} port ${spec.port} is busy`)
  }
  p.log.info('Stop the existing local dev processes and rerun `./launch-lms dev`.')
  process.exit(1)
}

function isWsl(): boolean {
  try {
    return fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
  } catch {
    return false
  }
}

function detectWslIpv4(): string | null {
  const result = spawnSync('hostname', ['-I'], { encoding: 'utf8' })
  if (result.status !== 0) return null

  const candidates = result.stdout
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip))
    .filter((ip) => ip !== '127.0.0.1')

  return candidates[0] || null
}

function getDevPublicHost(): string {
  const explicit = process.env.LAUNCHLMS_DEV_PUBLIC_HOST?.trim()
  if (explicit) return explicit

  if (isWsl()) {
    const wslIp = detectWslIpv4()
    if (wslIp) return `${wslIp}.sslip.io`
  }

  return DEFAULT_DEV_PUBLIC_HOST
}

function getDevDatabaseUrl(): string {
  return 'postgresql://launchlms:launchlms@localhost:5432/launchlms'
}

function runDevMigrations(root: string, apiDir: string): void {
  const migrationsScript = path.join(apiDir, 'scripts', 'run_alembic_migrations.sh')
  const uvCacheDir = path.join(root, '.launch-lms', 'uv-cache')

  if (!fs.existsSync(uvCacheDir)) {
    fs.mkdirSync(uvCacheDir, { recursive: true })
  }

  const env = {
    ...process.env,
    ...serviceEnv,
    UV_CACHE_DIR: process.env.UV_CACHE_DIR || uvCacheDir,
    LAUNCHLMS_SQL_CONNECTION_STRING:
      process.env.LAUNCHLMS_SQL_CONNECTION_STRING ||
      process.env.DATABASE_URL ||
      getDevDatabaseUrl(),
  }

  const migrationSpinner = p.spinner()
  migrationSpinner.start('Running database migrations...')

  try {
    execSync(`bash ${migrationsScript}`, {
      cwd: apiDir,
      stdio: 'pipe',
      env,
    })
    migrationSpinner.stop('Database migrations are up to date')
  } catch (e: any) {
    migrationSpinner.stop('Database migrations failed')
    const stderr = e?.stderr?.toString()?.trim()
    const stdout = e?.stdout?.toString()?.trim()
    p.log.error(stderr || stdout || 'Failed to run Alembic migrations')
    process.exit(1)
  }
}

async function waitForHealth(label: string, command: string, args: string[], maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      execSync([command, ...args].join(' '), { stdio: 'pipe', timeout: 5000 })
      return true
    } catch {
      await sleep(1000)
    }
  }
  return false
}

const CONTROLS_BAR = pc.dim('─'.repeat(60)) + '\n' +
  pc.dim('  ') + pc.bold('ra') + pc.dim(' restart api  ') +
  pc.bold('rw') + pc.dim(' restart web  ') +
  pc.bold('rc') + pc.dim(' restart collab  ') +
  pc.bold('rb') + pc.dim(' restart all  ') +
  pc.bold('q') + pc.dim(' quit') + '\n' +
  pc.dim('─'.repeat(60))

let lineCount = 0
const CONTROLS_INTERVAL = 50

function printControls() {
  process.stdout.write('\n' + CONTROLS_BAR + '\n\n')
  lineCount = 0
}

function prefixStream(proc: ChildProcess, label: string, color: (s: string) => string) {
  const prefix = color(`[${label}]`)
  const handleData = (data: Buffer) => {
    const lines = data.toString().split('\n')
    for (const line of lines) {
      if (line.length > 0) {
        process.stdout.write(`${prefix} ${line}\n`)
        lineCount++
        if (lineCount >= CONTROLS_INTERVAL) {
          printControls()
        }
      }
    }
  }
  proc.stdout?.on('data', handleData)
  proc.stderr?.on('data', handleData)
}

function isContainerRunning(name: string): boolean {
  try {
    const state = execSync(
      `docker inspect --format '{{.State.Running}}' ${name}`,
      { stdio: 'pipe' }
    ).toString().trim()
    return state === 'true'
  } catch {
    return false
  }
}

function isInfraRunning(): boolean {
  return isContainerRunning('launch-lms-db-dev') && isContainerRunning('launch-lms-redis-dev')
}

let serviceEnv: Record<string, string> = {}

function spawnService(command: string, args: string[], cwd: string, label: string, color: (s: string) => string): ChildProcess {
  const localBin = path.join(cwd, 'node_modules', '.bin')
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...serviceEnv,
      PATH: `${localBin}:${process.env.PATH ?? ''}`,
    },
  })
  prefixStream(child, label, color)
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.log(color(`[${label}]`) + ` exited with code ${code}`)
    }
  })
  return child
}

function killProcess(child: ChildProcess | null): Promise<void> {
  return new Promise((resolve) => {
    if (!child || child.killed || child.exitCode !== null) {
      resolve()
      return
    }
    child.on('exit', () => resolve())
    child.kill('SIGTERM')
    setTimeout(() => {
      if (!child.killed && child.exitCode === null) {
        child.kill('SIGKILL')
      }
    }, 5000)
  })
}

function certHasRequiredDevHosts(certPath: string, publicHost: string): boolean {
  try {
    const certPem = fs.readFileSync(certPath, 'utf8')
    const cert = new X509Certificate(certPem)
    const sans = cert.subjectAltName || ''
    return [
      'DNS:localhost',
      'IP Address:127.0.0.1',
      `DNS:${publicHost}`,
      `DNS:*.${publicHost}`,
    ].every((entry) => sans.includes(entry))
  } catch {
    return false
  }
}

export async function devCommand(opts: { ee?: boolean }) {
  const root = findProjectRoot()
  if (!root) {
    p.log.error('Not inside a Launch LMS project.')
    p.log.info('Run this command from within the launch-lms monorepo (must contain dev/docker-compose.yml, apps/api/, and apps/web/).')
    process.exit(1)
  }

  p.intro(pc.cyan('Launch LMS Dev Mode'))
  const devPublicHost = getDevPublicHost()

  // Check env files before anything else
  const envOk = await checkDevEnv(root)
  if (!envOk) process.exit(1)

  const eePath = path.join(root, 'apps', 'api', 'ee')
  if (fs.existsSync(eePath)) {
    p.log.info(`EE source detected at ${pc.bold('apps/api/ee')} — leaving it untouched for local dev`)
  } else if (opts.ee) {
    p.log.warning('--ee was passed but no ee/ folder found')
  }

  if (!isDockerInstalled()) {
    p.log.error('Docker is not installed. Please install Docker and try again.')
    process.exit(1)
  }

  if (!isDockerRunning()) {
    p.log.error('Docker is not running. Please start Docker and try again.')
    process.exit(1)
  }
  console.log()

  const composePath = getDevComposePath(root)

  // Check if infrastructure is already running
  const alreadyRunning = isInfraRunning()

  if (alreadyRunning) {
    p.log.success('Existing DB and Redis containers detected — reusing them')
  }

  // Only ask for admin credentials on first setup
  if (!alreadyRunning) {
    const email = await p.text({
      message: 'Admin email',
      placeholder: 'admin@school.dev',
      defaultValue: 'admin@school.dev',
    })
    if (p.isCancel(email)) process.exit(0)

    const password = await p.password({
      message: 'Admin password',
    })
    if (p.isCancel(password)) process.exit(0)

    if (!password) {
      p.log.error('Password is required.')
      process.exit(1)
    }

    serviceEnv = {
      FORCE_COLOR: '1',
      LAUNCHLMS_INITIAL_ADMIN_EMAIL: email,
      LAUNCHLMS_INITIAL_ADMIN_PASSWORD: password,
    }

    // Start infrastructure
    const infraSpinner = p.spinner()
    infraSpinner.start('Starting DB and Redis containers...')
    try {
      execSync(`docker compose -f ${composePath} -p ${PROJECT_NAME} up -d`, {
        cwd: root,
        stdio: 'pipe',
      })
      infraSpinner.stop('Containers started')
    } catch (e: any) {
      infraSpinner.stop('Failed to start containers')
      p.log.error(e.stderr?.toString() || 'docker compose up failed')
      process.exit(1)
    }
  } else {
    serviceEnv = {
      FORCE_COLOR: '1',
    }
  }

  // Health checks
  const healthSpinner = p.spinner()
  healthSpinner.start('Waiting for DB and Redis to be healthy...')

  const [dbReady, redisReady] = await Promise.all([
    waitForHealth('DB', 'docker', ['exec', 'launch-lms-db-dev', 'pg_isready', '-U', 'launchlms']),
    waitForHealth('Redis', 'docker', ['exec', 'launch-lms-redis-dev', 'redis-cli', 'ping']),
  ])

  if (!dbReady || !redisReady) {
    healthSpinner.stop('Health checks failed')
    if (!dbReady) p.log.error('Database did not become ready in time.')
    if (!redisReady) p.log.error('Redis did not become ready in time.')
    process.exit(1)
  }
  healthSpinner.stop('DB and Redis are healthy')

  const webDir = path.join(root, 'apps', 'web')
  const collabDir = path.join(root, 'apps', 'collab')
  const apiDir = path.join(root, 'apps', 'api')

  await ensurePortsAvailable([
    { port: parseInt(DEV_API_PORT, 10), label: 'API' },
    { port: parseInt(DEV_WEB_PORT, 10), label: 'Web' },
    { port: parseInt(DEV_COLLAB_PORT, 10), label: 'Collab' },
  ])

  // Auto-install missing dependencies
  const bunProjects = [
    { label: 'web', dir: webDir },
    { label: 'collab', dir: collabDir },
  ]

  for (const { label, dir } of bunProjects) {
    if (!fs.existsSync(path.join(dir, 'node_modules'))) {
      p.log.info(`Installing ${label} dependencies...`)
      const result = spawnSync('bun', ['install'], { cwd: dir, stdio: 'inherit', shell: true })
      if (result.status !== 0) {
        p.log.error(`Failed to install ${label} dependencies`)
        process.exit(1)
      }
    }
  }

  if (!fs.existsSync(path.join(apiDir, '.venv'))) {
    p.log.info('Installing API dependencies...')
    const result = spawnSync('uv', ['sync'], { cwd: apiDir, stdio: 'inherit', shell: true })
    if (result.status !== 0) {
      p.log.error('Failed to install API dependencies')
      process.exit(1)
    }
  }

  runDevMigrations(root, apiDir)

  // Detect TLS certs for HTTPS dev mode — generate them if missing
  const certFile = path.join(root, 'certs', 'local.pem')
  const keyFile = path.join(root, 'certs', 'local-key.pem')
  let hasCerts = fs.existsSync(certFile) && fs.existsSync(keyFile)
  const hasCompatibleCerts = hasCerts && certHasRequiredDevHosts(certFile, devPublicHost)

  if (!hasCompatibleCerts) {
    p.log.info(hasCerts ? 'Existing TLS certs are outdated — regenerating...' : 'No TLS certs found — running cert setup...')
    const setupScript = path.join(root, 'scripts', 'setup-dev-certs.sh')
    const result = spawnSync('bash', [setupScript], {
      stdio: 'inherit',
      cwd: root,
      env: {
        ...process.env,
        LAUNCHLMS_DEV_PUBLIC_HOST: devPublicHost,
      },
    })
    if (result.status === 0) {
      hasCerts = fs.existsSync(certFile) && fs.existsSync(keyFile)
      if (hasCerts) {
        p.log.success('TLS certs ready — starting with HTTPS')
      } else {
        p.log.warning('Cert script ran but certs not found — starting with HTTP')
      }
    } else {
      p.log.warning('Cert setup failed — starting with HTTP')
    }
  } else {
    p.log.success('TLS certs found — starting with HTTPS')
  }

  // When using HTTPS, tell Node.js to trust the mkcert root CA for server-side
  // fetch calls (e.g. Next.js middleware → API). Without this Node ignores the
  // system trust store and rejects our self-signed cert.
  if (hasCerts) {
    try {
      const caRoot = execSync('mkcert -CAROOT', { encoding: 'utf8' }).trim()
      const caPath = path.join(caRoot, 'rootCA.pem')
      if (fs.existsSync(caPath)) {
        serviceEnv.NODE_EXTRA_CA_CERTS = caPath
      }
    } catch {
      // mkcert not on PATH — certs exist but CA path unknown, proceed anyway
    }
  }

  const apiProtocol = hasCerts ? 'https' : 'http'
  const collabProtocol = hasCerts ? 'wss' : 'ws'
  const publicApiBaseUrl = `${apiProtocol}://${devPublicHost}:${DEV_API_PORT}`
  const internalApiBaseUrl = `${apiProtocol}://${DEV_LOCAL_HOST}:${DEV_API_PORT}`
  const publicWebOrigin = `${hasCerts ? 'https' : 'http'}://${devPublicHost}:${DEV_WEB_PORT}`
  const localWebOrigin = `${hasCerts ? 'https' : 'http'}://${DEV_LOCAL_HOST}:${DEV_WEB_PORT}`
  const publicCollabUrl = `${collabProtocol}://${devPublicHost}:${DEV_COLLAB_PORT}`

  serviceEnv = {
    ...serviceEnv,
    NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL: `${publicApiBaseUrl}/`,
    NEXT_PUBLIC_LEARNHOUSE_BACKEND_URL: `${publicApiBaseUrl}/`,
    NEXT_PUBLIC_LAUNCHLMS_API_URL: `${publicApiBaseUrl}/api/v1/`,
    NEXT_PUBLIC_LEARNHOUSE_API_URL: `${publicApiBaseUrl}/api/v1/`,
    NEXT_PUBLIC_LAUNCHLMS_DOMAIN: `${devPublicHost}:${DEV_WEB_PORT}`,
    NEXT_PUBLIC_LAUNCHLMS_TOP_DOMAIN: devPublicHost,
    NEXT_PUBLIC_LAUNCHLMS_HTTPS: hasCerts ? 'true' : 'false',
    NEXT_PUBLIC_COLLAB_URL: publicCollabUrl,
    LAUNCHLMS_DEV_PUBLIC_HOST: devPublicHost,
    LAUNCHLMS_INTERNAL_BACKEND_URL: internalApiBaseUrl,
    LAUNCHLMS_INTERNAL_API_URL: `${internalApiBaseUrl}/api/v1/`,
    LAUNCHLMS_API_URL: internalApiBaseUrl,
    LAUNCHLMS_DOMAIN: `${devPublicHost}:${DEV_API_PORT}`,
    LAUNCHLMS_FRONTEND_DOMAIN: `${devPublicHost}:${DEV_WEB_PORT}`,
    LAUNCHLMS_COOKIE_DOMAIN: hasCerts ? `.${devPublicHost}` : '',
    LAUNCHLMS_SSL: hasCerts ? 'true' : 'false',
    LAUNCHLMS_ALLOWED_ORIGINS: [
      `${publicWebOrigin}`,
      `${localWebOrigin}`,
      `${publicApiBaseUrl}`,
      `${internalApiBaseUrl}`,
    ].join(','),
    COLLAB_PORT: DEV_COLLAB_PORT,
    COLLAB_PUBLIC_URL: publicCollabUrl,
  }

  if (hasCerts) {
    serviceEnv.COLLAB_TLS_CERT = certFile
    serviceEnv.COLLAB_TLS_KEY = keyFile
    // Dev-only fallback for runtimes that do not honor the local mkcert root
    // consistently during server-side fetches.
    serviceEnv.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }

  // Start local services
  let apiProc: ChildProcess | null = null
  let webProc: ChildProcess | null = null
  let collabProc: ChildProcess | null = null

  const startApi = () => {
    const args = ['run', 'uvicorn', 'app:app', '--reload', '--host', '0.0.0.0', '--port', '1338']
    if (hasCerts) {
      args.push('--ssl-keyfile', keyFile, '--ssl-certfile', certFile)
    }
    return spawnService('uv', args, path.join(root, 'apps', 'api'), 'api', pc.magenta)
  }

  const startWeb = () => {
    const args = ['dev']
    if (hasCerts) args.push('--experimental-https', '--experimental-https-cert', certFile, '--experimental-https-key', keyFile)
    return spawnService('next', args, path.join(root, 'apps', 'web'), 'web', pc.cyan)
  }

  const startCollab = () => {
    return spawnService('tsx', ['watch', 'src/index.ts'], path.join(root, 'apps', 'collab'), 'collab', pc.yellow)
  }

  apiProc = startApi()
  webProc = startWeb()
  collabProc = startCollab()

  p.log.success('API, Web, and Collab servers started')
  console.log()
  console.log(pc.bold('Open:'))
  console.log(`  Web:    ${pc.cyan(publicWebOrigin)}`)
  console.log(`  API:    ${pc.magenta(publicApiBaseUrl)}`)
  console.log(`  Collab: ${pc.yellow(publicCollabUrl)}`)
  console.log(pc.dim('  Thank you for contributing to Launch LMS!'))
  console.log()

  printControls()

  // Graceful shutdown — keep containers running for reuse
  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    console.log('\n' + pc.dim('Shutting down dev servers...'))

    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false)
    }
    process.stdin.pause()

    await Promise.all([killProcess(apiProc), killProcess(webProc), killProcess(collabProc)])

    console.log(pc.dim('DB and Redis containers are still running for next session.'))
    console.log(pc.dim('To stop them: docker compose -f .launch-lms/docker-compose.dev.yml -p launch-lms-dev down'))
    console.log(pc.dim('Thanks for building with Launch LMS!'))
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Interactive key handling
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    let pendingR = false

    process.stdin.on('data', async (key: string) => {
      if (key === '\x03') {
        await shutdown()
        return
      }

      if (key === 'q') {
        await shutdown()
        return
      }

      if (key === 'r') {
        pendingR = true
        setTimeout(() => { pendingR = false }, 1000)
        return
      }

      if (pendingR) {
        pendingR = false

        if (key === 'a') {
          console.log(pc.magenta('\n  Restarting API...\n'))
          await killProcess(apiProc)
          apiProc = startApi()
          printControls()
        } else if (key === 'w') {
          console.log(pc.cyan('\n  Restarting Web...\n'))
          await killProcess(webProc)
          webProc = startWeb()
          printControls()
        } else if (key === 'c') {
          console.log(pc.yellow('\n  Restarting Collab...\n'))
          await killProcess(collabProc)
          collabProc = startCollab()
          printControls()
        } else if (key === 'b') {
          console.log(pc.yellow('\n  Restarting all...\n'))
          await Promise.all([killProcess(apiProc), killProcess(webProc), killProcess(collabProc)])
          apiProc = startApi()
          webProc = startWeb()
          collabProc = startCollab()
          printControls()
        }
      }
    })
  }

  // Keep process alive
  await new Promise(() => {})
}
