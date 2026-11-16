import { expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { previewTone } from '@components/Learning/player/ActivityPreview'
import { EditorPreviewModal, PREVIEW_SCRIM_CLASS } from '@components/Learning/player/EditorPreviewModal'

// Staff open an activity preview from the plan editor. Its backdrop and toolbar follow the
// theme tokens, so they read right in light and dark mode. The admin's dark mode turns the
// fixed zinc palette over (zinc-950 becomes near white), so a fixed scrim showed up light.

const FIXED_PALETTE = /\b(?:bg|text|border)-(?:zinc|gray|slate|neutral|stone|white|black)\b/

test('the staff preview backdrop is the theme page color, not a fixed zinc scrim', () => {
  expect(PREVIEW_SCRIM_CLASS).toContain('bg-background')
  const html = renderToStaticMarkup(<EditorPreviewModal activity={{ activity_uuid: 'activity_1' }} onClose={() => {}} />)
  const dialog = html.match(/<div class="([^"]*)" role="dialog"/)?.[1] || ''
  expect(dialog).toContain('bg-background/95')
  expect(dialog.includes('zinc-950')).toBe(false)
  // The "Preparing preview…" card is a theme card too.
  expect(html).toContain('bg-card')
  expect(html).toContain('Preparing preview')
})

test('the theme tone uses only theme tokens', () => {
  const tone = previewTone('theme')
  for (const value of Object.values(tone)) expect(FIXED_PALETTE.test(value)).toBe(false)
  expect(tone.bar).toContain('bg-card')
  expect(tone.active).toContain('bg-foreground')
})

test('the shared link page and the connector embed keep their fixed tones', () => {
  expect(previewTone('dark').bar).toContain('text-white')
  expect(previewTone('light').bar).toContain('bg-white')
})
