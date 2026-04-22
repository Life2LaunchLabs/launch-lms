import fs from 'node:fs'
import path from 'node:path'

export function parseEnvFile(envPath: string): Map<string, string> {
  const env = new Map<string, string>()
  if (!fs.existsSync(envPath)) return env

  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    env.set(trimmed.slice(0, eqIdx), trimmed.slice(eqIdx + 1))
  }

  return env
}

export function getEnvPath(installDir: string): string {
  return path.join(installDir, '.env')
}

export function getDatabaseCredentials(installDir: string): { user: string; database: string } {
  const env = parseEnvFile(getEnvPath(installDir))

  const connectionString = env.get('LAUNCHLMS_SQL_CONNECTION_STRING') || ''
  if (connectionString) {
    try {
      const parsed = new URL(connectionString)
      const user = decodeURIComponent(parsed.username || '')
      const database = parsed.pathname.replace(/^\//, '')

      if (user && database) {
        return { user, database }
      }
    } catch {
      // Fall back to POSTGRES_* variables below.
    }
  }

  return {
    user: env.get('POSTGRES_USER') || 'launch-lms',
    database: env.get('POSTGRES_DB') || 'launch-lms',
  }
}
