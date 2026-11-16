import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEVICE_BEZEL_CLASS } from '@components/Learning/editor/constants'

// The phone frame in the activity preview and on the editor canvas stays dark in both themes.
// Admin dark mode re-points the fixed palette (bg-black becomes the light primary color), so the
// bezel must use a color that rule leaves alone, and both frames must use the shared class.

const read = (path: string) => readFileSync(join(import.meta.dir, '../../../..', path), 'utf8')

test('the bezel is a literal dark color that admin dark mode does not re-point', () => {
  const hex = DEVICE_BEZEL_CLASS.match(/^bg-\[#([0-9a-f]{6})\]$/i)?.[1]
  expect(hex).toBeTruthy()
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex!.slice(at, at + 2), 16))
  expect(Math.max(r, g, b)).toBeLessThan(32)
  const darkRules = read('styles/admin-dark.css')
  expect(darkRules.includes(DEVICE_BEZEL_CLASS.replace(/[[\]#]/g, (c) => `\\${c}`))).toBe(false)
})

test('the preview and the editor canvas both draw the phone with the shared bezel', () => {
  for (const file of ['components/Learning/player/ActivityPreview.tsx', 'components/Learning/editor/LearningActivityEditor.tsx']) {
    const source = read(file)
    expect(source).toContain('DEVICE_BEZEL_CLASS')
    expect(source.includes("'rounded-[2rem] bg-black")).toBe(false)
  }
})
