import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

export type UiTestEnvironment = {
  baseUrl: string
  healthUrl: string
  email: string
  password: string
  orgSlug: string
  hubPath: string
  plansPath: string
  outputDir: string
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}. Copy tests/ui/.env.example to a protected local environment file.`)
  return value
}

export function loadUiTestEnvironment(options: { requireCredentials?: boolean } = {}): UiTestEnvironment {
  const baseUrl = new URL(required('UI_TEST_BASE_URL'))
  const local = LOCAL_HOSTS.has(baseUrl.hostname) || baseUrl.hostname === '127.0.0.1.sslip.io' || baseUrl.hostname.endsWith('.127.0.0.1.sslip.io')
  if (!local && process.env.UI_TEST_ALLOW_REMOTE !== 'true') {
    throw new Error('UI_TEST_BASE_URL is not local. Set UI_TEST_ALLOW_REMOTE=true only for an authorized disposable target.')
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('UI_TEST_BASE_URL must use http or https.')
  const targetKind = process.env.UI_TEST_TARGET_KIND || (local ? 'local' : '')
  if (!['local', 'disposable'].includes(targetKind)) {
    throw new Error('UI_TEST_TARGET_KIND must be local or disposable; shared and production targets are not permitted.')
  }

  const orgSlug = process.env.UI_TEST_ORG_SLUG?.trim() || 'default'
  const outputDir = resolve(process.cwd(), process.env.UI_TEST_OUTPUT_DIR || 'test-results/ui')
  mkdirSync(outputDir, { recursive: true })
  return {
    baseUrl: baseUrl.toString().replace(/\/$/, ''),
    healthUrl: new URL(process.env.UI_TEST_HEALTH_PATH || '/api/v1/health', baseUrl).toString(),
    email: options.requireCredentials === false ? (process.env.UI_TEST_EMAIL || '') : required('UI_TEST_EMAIL'),
    password: options.requireCredentials === false ? (process.env.UI_TEST_PASSWORD || '') : required('UI_TEST_PASSWORD'),
    orgSlug,
    hubPath: process.env.UI_TEST_HUB_PATH || `/orgs/${encodeURIComponent(orgSlug)}/hub`,
    plansPath: process.env.UI_TEST_PLANS_PATH || `/orgs/${encodeURIComponent(orgSlug)}/plans`,
    outputDir,
  }
}
