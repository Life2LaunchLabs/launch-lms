import { accessSync, constants, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { loginNormally } from './auth'
import { loadUiTestEnvironment } from './environment'

async function main(): Promise<void> {
  const environment = loadUiTestEnvironment()
  const health = await fetch(environment.healthUrl, { signal: AbortSignal.timeout(10_000) })
  if (!health.ok) throw new Error(`Health check failed: ${environment.healthUrl} returned ${health.status}.`)

  const executable = chromium.executablePath()
  accessSync(executable, constants.X_OK)
  mkdirSync(environment.outputDir, { recursive: true })
  const probe = `${environment.outputDir}/.write-probe`
  writeFileSync(probe, 'ok')
  unlinkSync(probe)

  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL: environment.baseUrl, ignoreHTTPSErrors: true })
  try {
    await loginNormally(page, environment)
  } finally {
    await browser.close()
  }
  process.stdout.write(`UI test target is healthy and normal login succeeded.\nBrowser: ${executable}\nOutput: ${environment.outputDir}\n`)
}

main().catch((error) => {
  process.stderr.write(`UI test doctor failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
