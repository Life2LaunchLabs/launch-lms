import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { UploadSlotRow } from '@components/Goals/steps/upload'
import type { StepEntry, UploadSlot } from '@services/goals/types'

const slot: UploadSlot = { key: 'checklist', label: 'Signed safety checklist (PDF)', kinds: ['document'] }
const handedIn = { entry_uuid: 'entry-1', kind: 'file', slot: 'checklist', url: 'https://example.test/checklist.pdf', title: 'checklist.pdf' } as unknown as StepEntry
const noop = () => {}

type Node = React.ReactElement<{ children?: React.ReactNode; onClick?: () => void }>
/** The first button in a rendered tree, without a DOM: the row has no hooks, so calling it gives its elements. */
function findButton(node: React.ReactNode): Node | null {
  if (!React.isValidElement(node)) return Array.isArray(node) ? node.map(findButton).find(Boolean) || null : null
  const element = node as Node
  if (element.type === 'button') return element
  return findButton(element.props.children)
}

describe('an upload slot on a learner step', () => {
  test('clicking anywhere on an empty slot, its name included, opens the picker', () => {
    let chosen = 0
    const button = findButton(UploadSlotRow({ slot, open: true, onChoose: () => { chosen += 1 }, onPick: noop, onLink: noop, onRemove: noop }))
    expect(Boolean(button)).toBe(true)
    const inside = renderToStaticMarkup(<>{button!.props.children}</>)
    expect(inside).toContain('Signed safety checklist (PDF)')
    expect(inside).toContain('Document')
    button!.props.onClick!()
    expect(chosen).toBe(1)
  })

  test('the slot button shows it can be clicked and focused', () => {
    const html = renderToStaticMarkup(<ul><UploadSlotRow slot={slot} open onChoose={noop} onPick={noop} onLink={noop} onRemove={noop} /></ul>)
    expect(html).toContain('aria-label="Add Signed safety checklist (PDF)"')
    expect(html).toContain('cursor-pointer')
    expect(html).toContain('focus-visible:ring-2')
  })

  test('a filled slot links to the file instead, and a closed step offers nothing to click', () => {
    const filled = renderToStaticMarkup(<ul><UploadSlotRow slot={slot} entries={[handedIn]} open onChoose={noop} onPick={noop} onLink={noop} onRemove={noop} /></ul>)
    expect(filled).not.toContain('aria-label="Add Signed')
    expect(filled).toContain('href="https://example.test/checklist.pdf"')
    const closed = renderToStaticMarkup(<ul><UploadSlotRow slot={slot} open={false} onChoose={noop} onPick={noop} onLink={noop} onRemove={noop} /></ul>)
    expect(closed).not.toContain('<button')
    expect(closed).toContain('Signed safety checklist (PDF)')
  })

  test('after hand-in a filled slot shows every file and offers another, but nothing to remove', () => {
    const photoOrPdf: UploadSlot = { key: 'poster', label: 'Your poster', kinds: ['image', 'document'] }
    const photo = { ...handedIn, entry_uuid: 'entry-2', slot: 'poster', url: 'https://example.test/poster.jpg', title: 'poster.jpg' } as unknown as StepEntry
    const pdf = { ...handedIn, entry_uuid: 'entry-3', slot: 'poster', url: 'https://example.test/poster.pdf', title: 'poster.pdf' } as unknown as StepEntry
    const picked: string[] = []
    const html = renderToStaticMarkup(<ul><UploadSlotRow slot={photoOrPdf} entries={[photo, pdf]} open={false} adding onChoose={noop} onPick={(kind) => picked.push(kind)} onLink={noop} onRemove={noop} /></ul>)
    expect(html).toContain('poster.jpg')
    expect(html).toContain('poster.pdf')
    // A photo and a document each get a button, so the PDF goes in beside the photo.
    expect(html).toContain('Add a photo')
    expect(html).toContain('Add a document')
    expect(html).not.toContain('Remove')
    const single = renderToStaticMarkup(<ul><UploadSlotRow slot={slot} entries={[handedIn]} open={false} adding onChoose={noop} onPick={noop} onLink={noop} onRemove={noop} /></ul>)
    expect(single).toContain('Add another')
    const closed = renderToStaticMarkup(<ul><UploadSlotRow slot={slot} entries={[handedIn]} open={false} adding={false} onChoose={noop} onPick={noop} onLink={noop} onRemove={noop} /></ul>)
    expect(closed).not.toContain('<button')
  })
})
