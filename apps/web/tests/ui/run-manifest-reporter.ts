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
      schema_version: 2,
      started_at: this.startedAt,
      finished_at: new Date().toISOString(),
      status: result.status,
      revision: git(['rev-parse', 'HEAD']),
      worktree_fingerprint: createHash('sha256').update(dirty).digest('hex'),
      base_origin: new URL(environment.baseUrl).origin,
      browser_projects: [...new Set(this.suite?.allTests().map((test) => test.parent.project()?.name) || [])],
      // The workflow already retains this manifest on successful runs. Embed only
      // explicitly opted-in synthetic captures; ordinary traces/screenshots may
      // contain private data and must never be copied into this review archive.
      synthetic_review_captures: this.suite?.allTests().flatMap((test) => test.results.flatMap((attempt) =>
        attempt.attachments.filter((attachment) => attachment.name.startsWith('synthetic-review:') && attachment.contentType === 'image/png').map((attachment) => {
          const body = attachment.body || (attachment.path ? readFileSync(attachment.path) : Buffer.alloc(0))
          if (!body.length || body.length > 10 * 1024 * 1024) throw new Error('Synthetic review capture must be between 1 byte and 10 MiB')
          return { filename: attachment.name.slice('synthetic-review:'.length), project: test.parent.project()?.name, retry: attempt.retry, sha256: createHash('sha256').update(body).digest('hex'), png_base64: body.toString('base64') }
        })
      )) || [],
      scenarios: this.suite?.allTests().map((test) => ({ id: test.titlePath().slice(1).join(' / '), outcome: test.outcome() })) || [],
    }
    mkdirSync(environment.outputDir, { recursive: true })
    writeFileSync(join(environment.outputDir, 'run-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }
}
