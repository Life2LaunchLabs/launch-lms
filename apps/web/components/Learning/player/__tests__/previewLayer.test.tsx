import { expect, test } from 'bun:test'
import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { EditorPreviewModal, PREVIEW_LAYER_CLASS } from '@components/Learning/player/EditorPreviewModal'

// At phone width the admin shows a sticky top bar at the nav layer. The activity preview has to
// sit above it, or the bar hides the preview's Close and Restart.

const zLayer = (name: string) => {
  const css = readFileSync(join(import.meta.dir, '../../../../styles/globals.css'), 'utf8')
  const value = css.match(new RegExp(`--z-${name}:\\s*(-?\\d+);`))?.[1]
  if (value === undefined) throw new Error(`--z-${name} is not defined`)
  return Number(value)
}

test('the preview dialog sits at the modal layer, above the admin phone top bar', () => {
  expect(PREVIEW_LAYER_CLASS).toContain('z-[var(--z-modal)]')
  expect(zLayer('modal')).toBeGreaterThan(zLayer('nav'))
  const html = renderToStaticMarkup(<EditorPreviewModal activity={{ activity_uuid: 'activity_1' }} onClose={() => {}} />)
  const dialog = html.match(/<div class="([^"]*)" role="dialog"/)?.[1] || ''
  expect(dialog).toContain('z-[var(--z-modal)]')
  expect(dialog.includes('z-50')).toBe(false)
})
