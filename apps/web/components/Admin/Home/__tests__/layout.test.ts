import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homeColumns } from '@components/Admin/Home/layout'

// bun test runs from apps/web.
const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), 'utf8')

describe('admin home layout', () => {
  test('the side column joins once the page frame is 64rem wide, not 80rem', () => {
    expect(homeColumns.startsWith('lg:')).toBe(true)
    const css = read('styles', 'globals.css')
    const lg = css.slice(css.indexOf('@custom-variant lg {'), css.indexOf('@custom-variant xl {'))
    expect(lg).toContain('@container page (width >= 64rem)')
  })

  test('Home and its loading skeleton both use the shared columns', () => {
    const source = read('components', 'Admin', 'Home', 'AdminHome.tsx')
    expect(source).not.toContain('xl:grid-cols')
    expect((source.match(/homeColumns/g) || []).length).toBe(3)
  })
})
