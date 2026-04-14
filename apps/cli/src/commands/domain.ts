import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { findInstallDir, readConfig } from '../services/config-store.js'
import { dockerComposeDown, dockerComposeUp } from '../services/docker.js'

function parseEnv(content: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    map.set(trimmed.slice(0, eqIdx), trimmed.slice(eqIdx + 1))
  }
  return map
}

function serializeEnv(original: string, updated: Map<string, string>): string {
  const lines = original.split('\n')
  const result: string[] = []
  const written = new Set<string>()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      result.push(line)
      continue
    }
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) {
      result.push(line)
      continue
    }
    const key = trimmed.slice(0, eqIdx)
    if (updated.has(key)) {
      result.push(`${key}=${updated.get(key)}`)
      written.add(key)
    } else {
      result.push(line)
    }
  }

  for (const [key, value] of updated) {
    if (!written.has(key)) result.push(`${key}=${value}`)
  }

  return result.join('\n')
}

function deriveTopDomain(domain: string): string {
  return domain === 'localhost'
    ? 'localhost'
    : domain.split('.').slice(-2).join('.')
}

function deriveCookieDomain(domain: string): string {
  return domain === 'localhost'
    ? '.localhost'
    : `.${deriveTopDomain(domain)}`
}

function replaceCaddySite(content: string, domain: string): string {
  const lines = content.split('\n')
  let globalBlockDepth = 0
  let inGlobalOptions = false

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    if (!inGlobalOptions && trimmed === '{') {
      inGlobalOptions = true
      globalBlockDepth = 1
      continue
    }

    if (inGlobalOptions) {
      globalBlockDepth += (trimmed.match(/{/g) || []).length
      globalBlockDepth -= (trimmed.match(/}/g) || []).length
      if (globalBlockDepth <= 0) {
        inGlobalOptions = false
      }
      continue
    }

    if (trimmed.endsWith('{')) {
      const indent = lines[i].match(/^\s*/)?.[0] ?? ''
      lines[i] = `${indent}${domain} {`
      return lines.join('\n')
    }
  }

  throw new Error('Could not find a Caddy site block to update')
}

function collectCaddyCandidates(installDir: string, explicitPath?: string): string[] {
  const candidates = [
    explicitPath,
    path.join(installDir, 'extra', 'Caddyfile'),
    path.join(installDir, 'Caddyfile'),
    '/etc/caddy/Caddyfile',
  ].filter((value): value is string => Boolean(value))

  return [...new Set(candidates)].filter((filePath) => fs.existsSync(filePath))
}

function updateCaddyFiles(domain: string, installDir: string, explicitPath?: string): string[] {
  const updated: string[] = []
  for (const filePath of collectCaddyCandidates(installDir, explicitPath)) {
    const original = fs.readFileSync(filePath, 'utf-8')
    const next = replaceCaddySite(original, domain)
    if (next !== original) {
      fs.writeFileSync(filePath, next)
      updated.push(filePath)
    }
  }
  return updated
}

interface DomainCommandOptions {
  restart?: boolean
  reloadCaddy?: boolean
  caddyPath?: string
}

export async function domainCommand(domain: string, options: DomainCommandOptions) {
  const installDir = findInstallDir()
  const config = readConfig(installDir)

  if (!config) {
    p.log.error('No Launch LMS installation found in the current directory.')
    process.exit(1)
  }

  const envPath = path.join(config.installDir, '.env')
  if (!fs.existsSync(envPath)) {
    p.log.error(`No .env file found at ${envPath}`)
    process.exit(1)
  }

  const protocol = config.useHttps ? 'https' : 'http'
  const portSuffix = (config.useHttps && config.httpPort === 443) || (!config.useHttps && config.httpPort === 80)
    ? ''
    : `:${config.httpPort}`
  const baseUrl = `${protocol}://${domain}${portSuffix}`
  const topDomain = deriveTopDomain(domain)
  const cookieDomain = deriveCookieDomain(domain)
  const collabProtocol = config.useHttps ? 'wss' : 'ws'

  p.intro(pc.cyan('Launch LMS Domain Update'))

  const originalEnv = fs.readFileSync(envPath, 'utf-8')
  const envMap = parseEnv(originalEnv)
  const previousDomain = envMap.get('LAUNCHLMS_DOMAIN') || config.domain

  envMap.set('LAUNCHLMS_DOMAIN', `${domain}${portSuffix}`)
  envMap.set('NEXT_PUBLIC_LAUNCHLMS_API_URL', `${baseUrl}/api/v1/`)
  envMap.set('NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL', `${baseUrl}/`)
  envMap.set('NEXT_PUBLIC_LAUNCHLMS_DOMAIN', `${domain}${portSuffix}`)
  envMap.set('NEXT_PUBLIC_LAUNCHLMS_TOP_DOMAIN', topDomain)
  envMap.set('NEXTAUTH_URL', baseUrl)
  envMap.set('LAUNCHLMS_COOKIE_DOMAIN', cookieDomain)
  envMap.set('NEXT_PUBLIC_COLLAB_URL', `${collabProtocol}://${domain}${portSuffix}/collab`)

  const systemEmail = envMap.get('LAUNCHLMS_SYSTEM_EMAIL_ADDRESS')
  if (systemEmail === `noreply@${config.domain}` || systemEmail === `noreply@${previousDomain.replace(/:\d+$/, '')}`) {
    envMap.set('LAUNCHLMS_SYSTEM_EMAIL_ADDRESS', `noreply@${domain}`)
  }

  fs.writeFileSync(envPath, serializeEnv(originalEnv, envMap))

  const nextConfig = { ...config, domain }
  fs.writeFileSync(
    path.join(config.installDir, 'launch-lms.config.json'),
    JSON.stringify(nextConfig, null, 2) + '\n',
  )

  let updatedCaddyFiles: string[] = []
  try {
    updatedCaddyFiles = updateCaddyFiles(domain, config.installDir, options.caddyPath)
  } catch (err: any) {
    p.log.warn(`Caddy update skipped: ${err?.message ?? String(err)}`)
  }

  p.log.success(`Updated domain references from ${pc.dim(previousDomain)} to ${pc.bold(domain)}`)
  p.log.info(pc.dim(`Environment: ${envPath}`))
  if (updatedCaddyFiles.length > 0) {
    for (const filePath of updatedCaddyFiles) {
      p.log.info(pc.dim(`Caddy config: ${filePath}`))
    }
  } else {
    p.log.warn('No Caddyfile was updated automatically')
  }

  if (options.restart !== false) {
    const s = p.spinner()
    s.start('Restarting Launch LMS services')
    try {
      dockerComposeDown(config.installDir)
      dockerComposeUp(config.installDir)
      s.stop('Launch LMS services restarted')
    } catch (err: any) {
      s.stop('Failed to restart Launch LMS services')
      p.log.error(err?.message ?? String(err))
      process.exit(1)
    }
  }

  if (options.reloadCaddy !== false && updatedCaddyFiles.some((filePath) => filePath === '/etc/caddy/Caddyfile')) {
    try {
      execSync('systemctl reload caddy', { stdio: 'inherit' })
      p.log.success('Reloaded system Caddy')
    } catch (err: any) {
      p.log.warn(`Failed to reload system Caddy automatically: ${err?.message ?? String(err)}`)
    }
  }

  p.log.message([
    `  ${pc.dim('Next URL:')}      ${baseUrl}`,
    `  ${pc.dim('Cookie domain:')} ${cookieDomain}`,
    `  ${pc.dim('Top domain:')}    ${topDomain}`,
  ].join('\n'))
  p.outro(pc.dim('Done'))
}
