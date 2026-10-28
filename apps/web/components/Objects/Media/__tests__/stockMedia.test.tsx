import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import StockMediaTab, { duration } from '@components/Objects/Media/StockMediaTab'

describe('stock media', () => {
  test('starts with search ideas and says where the media comes from', () => {
    const html = renderToStaticMarkup(<StockMediaTab orgId={1} kind="photo" accessToken="t" onPick={() => {}} />)
    expect(html).toContain('Search free photos')
    expect(html).toContain('friends laughing')
    expect(html).toContain('Free to use from Pexels')
    expect(renderToStaticMarkup(<StockMediaTab orgId={1} kind="video" accessToken="t" onPick={() => {}} />)).toContain('Search free videos')
  })

  test('shows video lengths as minutes and seconds', () => {
    expect(duration(12)).toBe('0:12')
    expect(duration(95)).toBe('1:35')
    expect(duration(null)).toBe('')
  })
})
