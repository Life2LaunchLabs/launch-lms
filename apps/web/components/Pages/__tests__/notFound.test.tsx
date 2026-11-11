import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// In the dark theme the 404 page's background turns dark (the admin surface re-points
// zinc/slate at dark shades), so fixed black text came out black on near-black.
describe('404 page', () => {
  const source = readFileSync(join(process.cwd(), 'app', 'not-found.tsx'), 'utf8')

  test('uses theme text colors that follow light and dark', () => {
    expect(/\btext-black\b/.test(source)).toBe(false)
    expect(/\bbg-black\b/.test(source)).toBe(false)
    expect(/<h1[^>]*\btext-foreground\b/.test(source)).toBe(true)
    expect(/<p[^>]*\btext-foreground\b/.test(source)).toBe(true)
  })

  test('paints its own theme background', () => {
    expect(/\bbg-background\b/.test(source)).toBe(true)
    expect(/\bfrom-zinc-200\b|\bto-slate-300\b/.test(source)).toBe(false)
  })
})
