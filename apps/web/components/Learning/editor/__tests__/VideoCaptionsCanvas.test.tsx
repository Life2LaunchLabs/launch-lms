import { describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

mock.module('@components/Contexts/LHSessionContext', () => ({ useLHSession: () => ({ data: null }) }))
import { VideoCaptionsCanvas } from '@components/Learning/editor/VideoCaptionsCanvas'

const source = readFileSync(join(process.cwd(), 'components', 'Learning', 'editor', 'VideoCaptionsCanvas.tsx'), 'utf8')

const page = { page_uuid: 'page_1', page_type: 'video', content: { video_url: 'https://example.org/flat-fix.mp4' } }

describe('video page on the activity canvas', () => {
  test('opening the page shows the video with its controls and edits nothing', () => {
    const patches: any[] = []
    const html = renderToStaticMarkup(<VideoCaptionsCanvas page={page} device="mobile" onRequestVideo={() => {}} onPatchPage={(patch) => patches.push(patch)} />)
    expect(html).toContain('<video')
    expect(html).toContain('controls')
    expect(patches).toEqual([])
  })

  test('loading or playing the video never saves into the page (FEED-114)', () => {
    const video = source.slice(source.indexOf('<video'), source.indexOf('/>', source.indexOf('<video')))
    expect(video).toContain('onTimeUpdate')
    for (const event of ['onLoadedMetadata', 'onLoadedData', 'onDurationChange', 'onCanPlay', 'onPlay', 'onPlaying', 'onPause', 'onEnded', 'onSeeked']) {
      expect(video).not.toContain(event)
    }
    expect(video).not.toContain('onPatchPage')
    expect(source).not.toContain('video_duration_seconds')
  })
})
