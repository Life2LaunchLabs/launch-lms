import { describe, expect, test } from 'bun:test'
import React from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { isVideoGatedPage, LearningPageContent } from '@components/Learning/LearningBadgeViews'
import { LearningActivitySurface } from '@components/Learning/player/ActivitySurface'

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const page = { page_uuid: 'p1', page_type: 'video', title: 'Watch', content: { video_url: '/content/orgs/o/media/demo.mp4', heading: 'Watch the demo' } }

describe('an uploaded activity video can always be started (FEED-113)', () => {
  test('a video page with a video stays locked until it ends', () => {
    expect(isVideoGatedPage(page)).toBe(true)
    expect(isVideoGatedPage({ ...page, content: {} })).toBe(false)
    expect(isVideoGatedPage({ page_uuid: 'p2', page_type: 'standard', content: { blocks: [] } })).toBe(false)
  })

  test("the player doesn't unlock a video page after the page locked itself", () => {
    expect(source('../player/ActivityPlayer.tsx')).toContain('!isVideoGatedPage(page) && (!isQuestionResponseRequired(page)')
  })

  test('a paused or blocked video shows a play button, and the video toggles on tap', () => {
    const paused = renderToStaticMarkup(<LearningPageContent page={page} answer={{ videoStarted: true, videoPlaying: false }} setAnswer={() => {}} setUnlocked={() => {}} />)
    expect(paused).toContain('data-video-play')
    expect(paused).toContain('aria-label="Play video"')
    const playing = renderToStaticMarkup(<LearningPageContent page={page} answer={{ videoStarted: true, videoPlaying: true }} setAnswer={() => {}} setUnlocked={() => {}} />)
    expect(playing).not.toContain('data-video-play')
  })

  test('a locked video page shows play controls instead of Continue', () => {
    const html = renderToStaticMarkup(
      <LearningActivitySurface pages={[page]} page={page} pageIndex={0} actionLabel="Finish preview" actionDisabled interactionState={{ videoStarted: true, videoPlaying: false }}>
        <div />
      </LearningActivitySurface>
    )
    expect(html).toContain('aria-label="Play video"')
    expect(html).not.toContain('Finish preview')
  })
})
