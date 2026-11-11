import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The product is Life2Launch (FEED-65): the old names stay out of anything people read. */
const OLD = /Launch LMS|Launchpad/
const root = fileURLToPath(new URL('../../../', import.meta.url))

const strings = (node: unknown, out: string[] = []): string[] => {
  if (typeof node === 'string') out.push(node)
  else if (node && typeof node === 'object') Object.values(node).forEach((v) => strings(v, out))
  return out
}

describe('brand name', () => {
  test('no translation uses an old product name', () => {
    for (const file of readdirSync(join(root, 'locales')).filter((f) => f.endsWith('.json'))) {
      const bad = strings(JSON.parse(readFileSync(join(root, 'locales', file), 'utf8'))).filter((s) => OLD.test(s))
      expect({ file, bad }).toEqual({ file, bad: [] })
    }
  })

  test('the front page leads with planning, and the fallback wordmark says Life2Launch', () => {
    const page = readFileSync(join(root, 'app/orgs/[orgslug]/(withmenu)/page.tsx'), 'utf8')
    expect(page).toContain('Plan your next chapter')
    expect(/launchpad/i.test(page)).toBe(false)
    expect(readFileSync(join(root, 'public/logo-text.svg'), 'utf8')).toContain('Life2Launch')
  })
})
