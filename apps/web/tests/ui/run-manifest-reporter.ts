import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FullConfig, FullResult, Reporter, Suite } from '@playwright/test/reporter'
import { loadUiTestEnvironment } from './environment'

function git(command: string[]): string {
  try { return execFileSync('git', command, { cwd: process.cwd(), encoding: 'utf8' }).trim() }
  catch { return 'unavailable' }
}

export default class RunManifestReporter implements Reporter {
  private startedAt = new Date().toISOString()
  private suite?: Suite
  onBegin(_config: FullConfig, suite: Suite): void { this.suite = suite }
  onEnd(result: FullResult): void {
    const environment = loadUiTestEnvironment({ requireCredentials: false })
    const trackedChanges = git(['diff', '--binary', 'HEAD'])
    const untrackedFiles = git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)
    const untrackedHashes = untrackedFiles.map((path) => {
      try { return `${path}:${createHash('sha256').update(readFileSync(join(process.cwd(), path))).digest('hex')}` }
      catch { return `${path}:unreadable` }
    }).join('\n')
    const dirty = `${git(['status', '--short'])}\n${trackedChanges}\n${untrackedHashes}`
    const manifest = {
      schema_version: 1,
      started_at: this.startedAt,
      finished_at: new Date().toISOString(),
      status: result.status,
      revision: git(['rev-parse', 'HEAD']),
      worktree_fingerprint: createHash('sha256').update(dirty).digest('hex'),
      base_origin: new URL(environment.baseUrl).origin,
      browser_projects: [...new Set(this.suite?.allTests().map((test) => test.parent.project()?.name) || [])],
      scenarios: this.suite?.allTests().map((test) => ({ id: test.titlePath().slice(1).join(' / '), outcome: test.outcome() })) || [],
    }
    mkdirSync(environment.outputDir, { recursive: true })
    writeFileSync(join(environment.outputDir, 'run-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }
}
