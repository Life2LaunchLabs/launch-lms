'use client'

/* eslint-disable no-unused-vars */

import React from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Columns2,
  GalleryHorizontal,
  GitBranch,
  Hash,
  Image as ImageIcon,
  ListChecks,
  Lock,
  MousePointerClick,
  PanelRight,
  Plus,
  RectangleHorizontal,
  Square,
  TextCursorInput,
  Type,
  Upload,
  Video,
} from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@components/ui/dropdown-menu'
import { SCENES } from '@components/Learning/player/design'
import { blockLabel, createOptionId } from './utils'
import { Check, ColorMenu, FieldsMenu, Menu, MotionMenu, Name, RowActions, Sep, TRANSITIONS, TextTools, Tool, on } from './toolbarParts'
import { KeepMenu, TheirInfoMenu, infoGroups } from './TheirInfo'

export type InsertType = 'text' | 'image' | 'number' | 'card_deck' | 'button' | 'multiple_choice' | 'categorized_multi_select' | 'text_input' | 'image_upload'

type ToolbarProps = {
  page: any
  block: any | null
  textEditor: any
  inspectorOpen: boolean
  onToggleInspector: () => void
  onInsert: (type: InsertType) => void
  onPatchPage: (patch: any) => void
  onPatchBlock: (blockId: string, patch: any) => void
  onDuplicate: () => void
  onRemove: () => void
  onBranchFrom: (block: any) => void
  onToggleSideBySide: () => void
  onReplaceImage: (blockId: string) => void
  onReplaceVideo: () => void
  onBackgroundImage: () => void
  onShowDesktop: () => void
  /** For "Their info" and "Keep answer". */
  info: { variables: any[]; pages: any[]; pageOrder: string[]; onCreateDetail: (key: string, label: string) => Promise<any> }
}

const BACKGROUNDS = [
  { label: 'App theme', value: null, swatch: 'var(--color-gray-50, #f8fafc)' },
  { label: 'Accent', value: { color: '#4f46e5' }, swatch: '#4f46e5' },
  { label: 'Ink', value: { color: '#0f172a' }, swatch: '#0f172a' },
  { label: 'Night sky', value: { color: '#0f172a', gradient_to: '#1e3a8a' }, swatch: 'linear-gradient(160deg,#0f172a,#1e3a8a)' },
  { label: 'Warm', value: { color: '#fff4e0' }, swatch: '#fff4e0' },
  { label: 'Mint', value: { color: '#dcfce7' }, swatch: '#dcfce7' },
]

const HEADING_SIZES = ['s', 'm', 'l', 'xl']

export function SelectionToolbar(props: ToolbarProps) {
  const { page, block, inspectorOpen, onToggleInspector } = props
  const patch = (value: any) => block && props.onPatchBlock(block.id, value)
  let tools: React.ReactNode = null
  if (!page) tools = null
  else if (block) tools = <BlockTools {...props} block={block} patch={patch} />
  else if (page.page_type === 'video') tools = <VideoPageTools {...props} />
  else tools = <PageTools {...props} />
  return (
    <div role="toolbar" aria-label={block ? `${blockLabel(block)} tools` : 'Page tools'} className="@container/toolbar flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-gray-200 bg-white px-3" onMouseDown={(event) => {
      // Keep the text selection while using the toolbar.
      const target = event.target as HTMLElement
      if (target.closest('button') && !target.closest('input, textarea')) event.preventDefault()
    }}>
      {tools}
      <span className="flex-1" />
      <Tool title={inspectorOpen ? 'Hide more settings' : 'More settings'} active={inspectorOpen} onClick={onToggleInspector}><PanelRight size={15} /></Tool>
    </div>
  )
}

function PageTools({ page, onInsert, onPatchPage, onBackgroundImage, onShowDesktop }: ToolbarProps) {
  const design = page.design || {}
  const blocks: any[] = page.content?.blocks || []
  const variants = Boolean(page.content?.variants)
  const columns = blocks.some((item) => item.type === 'column_break')
  const valign = design.valign || 'middle'
  const insert = (type: InsertType, icon: React.ReactNode, label: string, disabled = false) => <Tool compact label={label} onClick={() => onInsert(type)} disabled={disabled} title={disabled ? 'Pages with variants cannot hold questions' : `Add ${label.toLowerCase()}`}>{icon}</Tool>
  const setColumns = (two: boolean) => {
    const without = blocks.filter((item) => item.type !== 'column_break')
    if (!two) { onPatchPage({ design: { ...design, columns: 1 }, content: { ...(page.content || {}), blocks: without } }); return }
    if (columns) return
    const image = without.findIndex((item) => item.type === 'image')
    const at = image >= 0 ? image + 1 : Math.ceil(without.length / 2)
    const next = [...without]
    next.splice(at, 0, { id: `blk_${createOptionId().slice(-8)}`, type: 'column_break' })
    onPatchPage({ design: { ...design, columns: 2 }, content: { ...(page.content || {}), blocks: next } })
    onShowDesktop()
  }
  const background = design.background || null
  return (
    <>
      {insert('text', <Type size={15} />, 'Text')}
      {insert('image', <ImageIcon size={15} />, 'Image')}
      {insert('number', <Hash size={15} />, 'Number')}
      {insert('card_deck', <GalleryHorizontal size={15} />, 'Card deck')}
      <Sep />
      {insert('multiple_choice', <ListChecks size={15} />, 'Choice', variants)}
      {insert('text_input', <TextCursorInput size={15} />, 'Text answer', variants)}
      {insert('image_upload', <Upload size={15} />, 'Upload', variants)}
      <Menu label="More" align="start">
        <DropdownMenuItem onClick={() => onInsert('button')}><MousePointerClick size={14} className="mr-2" />Button</DropdownMenuItem>
        {!variants && <DropdownMenuItem onClick={() => onInsert('categorized_multi_select')}><ListChecks size={14} className="mr-2" />Sorted choice</DropdownMenuItem>}
      </Menu>
      <Sep />
      <Menu label="Background" icon={<span className="h-4 w-4 rounded border border-gray-300" style={{ background: background?.image ? `center/cover url("${String(background.image).replace(/"/g, '%22')}")` : background?.gradient_to ? `linear-gradient(160deg, ${background.color}, ${background.gradient_to})` : background?.color || 'transparent' }} />}>
        <DropdownMenuLabel className="text-xs text-gray-500">Colour</DropdownMenuLabel>
        <div className="grid grid-cols-3 gap-1.5 px-2 pb-2">
          {BACKGROUNDS.map((item) => (
            <DropdownMenuItem key={item.label} onSelect={() => onPatchPage({ design: { ...design, background: item.value || background?.scene ? { color: item.value?.color, gradient_to: (item.value as any)?.gradient_to, image: undefined, scene: background?.scene } : undefined } })} className="flex cursor-pointer flex-col items-center gap-1 rounded-lg p-1 text-[11px] font-semibold">
              <span className="h-9 w-14 rounded-md border border-gray-200" style={{ background: item.swatch }} />{item.label}
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuItem onClick={onBackgroundImage}><ImageIcon size={14} className="mr-2" />{background?.image ? 'Change the photo…' : 'Use a photo…'}</DropdownMenuItem>
        {background?.image && <DropdownMenuItem onClick={() => onPatchPage({ design: { ...design, background: { ...background, image: undefined } } })}>Remove the photo</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-gray-500">Scene</DropdownMenuLabel>
        {SCENES.map((scene) => (
          <DropdownMenuItem key={scene.value} onClick={() => onPatchPage({ design: { ...design, background: { ...(background || {}), scene: scene.value === 'none' ? undefined : scene.value } } })}>
            {scene.label}<Check checked={(background?.scene || 'none') === scene.value} />
          </DropdownMenuItem>
        ))}
      </Menu>
      <span className="flex shrink-0 rounded-lg border border-gray-200 p-0.5" role="group" aria-label="Vertical position">
        {([['top', AlignVerticalJustifyStart, 'Top'], ['middle', AlignVerticalJustifyCenter, 'Middle'], ['bottom', AlignVerticalJustifyEnd, 'Bottom']] as const).map(([value, Icon, label]) => (
          <button key={value} type="button" title={label} aria-label={label} aria-pressed={valign === value} onClick={() => onPatchPage({ design: { ...design, valign: value === 'middle' ? undefined : value } })} className={`flex h-7 w-7 items-center justify-center rounded-md ${valign === value ? on : 'text-gray-600 hover:bg-gray-100'}`}><Icon size={15} /></button>
        ))}
      </span>
      <span className="flex shrink-0 rounded-lg border border-gray-200 p-0.5" role="group" aria-label="Columns on desktop">
        <button type="button" title="One column" aria-label="One column" aria-pressed={!columns} onClick={() => setColumns(false)} className={`flex h-7 w-7 items-center justify-center rounded-md ${!columns ? on : 'text-gray-600 hover:bg-gray-100'}`}><Square size={14} /></button>
        <button type="button" title="Two columns on desktop" aria-label="Two columns on desktop" aria-pressed={columns} onClick={() => setColumns(true)} className={`flex h-7 w-7 items-center justify-center rounded-md ${columns ? on : 'text-gray-600 hover:bg-gray-100'}`}><Columns2 size={14} /></button>
      </span>
      <TransitionMenu design={design} onPatchPage={onPatchPage} />
    </>
  )
}

function TransitionMenu({ design, onPatchPage }: { design: any; onPatchPage: (patch: any) => void }) {
  const current = design.transition || ''
  return (
    <Menu label="Transition" icon={<RectangleHorizontal size={14} />}>
      <DropdownMenuLabel className="text-xs text-gray-500">How this page comes in</DropdownMenuLabel>
      {TRANSITIONS.map((item) => (
        <DropdownMenuItem key={item.value || 'default'} onClick={() => onPatchPage({ design: { ...design, transition: item.value || undefined } })}>
          {item.label}<Check checked={current === item.value} />
        </DropdownMenuItem>
      ))}
    </Menu>
  )
}

function VideoPageTools({ page, onReplaceVideo, onPatchPage }: ToolbarProps) {
  const content = page.content || {}
  return (
    <>
      <Name>Video page</Name>
      <Tool label={content.video_url ? 'Replace video' : 'Choose a video'} onClick={onReplaceVideo}><Video size={15} /></Tool>
      <Tool label="Let them skip ahead" active={content.allow_scrubbing !== false} onClick={() => onPatchPage({ content: { ...content, allow_scrubbing: content.allow_scrubbing === false } })} />
      <Sep />
      <TransitionMenu design={page.design || {}} onPatchPage={onPatchPage} />
    </>
  )
}

function BlockTools({ block, page, textEditor, patch, info, onDuplicate, onRemove, onBranchFrom, onReplaceImage, onToggleSideBySide }: ToolbarProps & { block: any; patch: (value: any) => void }) {
  const design = block.design || {}
  const content = block.content || {}
  const locked = block.system?.locked ? (block.system.reason || 'Managed by the system') : undefined
  const motion = <><Sep /><MotionMenu block={block} onPatch={patch} /></>
  const actions = <RowActions block={block} onDuplicate={onDuplicate} onRemove={onRemove} lockedReason={locked} />

  if (block.type === 'heading') {
    const size = content.size || 'l'
    return (
      <>
        <Name>Heading</Name>
        <span className="flex shrink-0 rounded-lg border border-gray-200 p-0.5" role="group" aria-label="Heading size">
          {HEADING_SIZES.map((value) => <button key={value} type="button" aria-label={`Heading size ${value.toUpperCase()}`} aria-pressed={size === value} onClick={() => patch({ content: { ...content, size: value } })} className={`h-7 rounded-md px-2 text-xs font-bold uppercase ${size === value ? on : 'text-gray-600 hover:bg-gray-100'}`}>{value}</button>)}
        </span>
        <ColorMenu value={design.text_color || ''} onPick={(color) => patch({ design: { ...design, text_color: color || undefined } })} />
        <Sep />
        {(['left', 'center', 'right'] as const).map((value) => {
          const Icon = value === 'left' ? AlignLeft : value === 'center' ? AlignCenter : AlignRight
          return <Tool key={value} title={`Align ${value}`} active={(design.align || 'left') === value} onClick={() => patch({ design: { ...design, align: value === 'left' ? undefined : value } })}><Icon size={15} /></Tool>
        })}
        {motion}
        <Sep />
        <span title="Every page has one heading" className="flex h-8 items-center gap-1 px-2 text-xs font-bold text-gray-400"><Lock size={13} /> One per page</span>
      </>
    )
  }
  if (block.type === 'text') return <><Name>Text</Name><TextTools editor={textEditor} /><Sep /><TheirInfoMenu editor={textEditor} groups={infoGroups(info.variables, info.pages, info.pageOrder, page?.page_uuid)} />{motion}{actions}</>
  if (block.type === 'number') {
    return (
      <>
        <Name>Number</Name>
        <FieldsMenu label="Number" fields={[
          { key: 'value', label: 'The number', value: String(content.value ?? '') },
          { key: 'prefix', label: 'Before it (e.g. $)', value: content.prefix || '' },
          { key: 'suffix', label: 'After it (e.g. %)', value: content.suffix || '' },
          { key: 'label', label: 'Line under it', value: content.label || '' },
        ]} onChange={(key, value) => patch({ content: { ...content, [key]: key === 'value' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : value } })} />
        {motion}{actions}
      </>
    )
  }
  if (block.type === 'image') {
    const width = Number(design.width) || 100
    const height = Number(design.height) || 220
    return (
      <>
        <Name>Image</Name>
        <Tool label="Replace" onClick={() => onReplaceImage(block.id)}><ImageIcon size={15} /></Tool>
        <Menu label={`Shape: ${design.shape === 'circle' ? 'Circle' : 'Rounded'}`}>
          {[['rounded', 'Rounded'], ['circle', 'Circle']].map(([value, label]) => <DropdownMenuItem key={value} onClick={() => patch({ design: { ...design, shape: value } })}>{label}<Check checked={(design.shape || 'rounded') === value} /></DropdownMenuItem>)}
        </Menu>
        <Menu label={`Width: ${width === 100 ? 'Full' : `${width}%`}`}>
          {[100, 75, 50, 33].map((value) => <DropdownMenuItem key={value} onClick={() => patch({ design: { ...design, width: value, align: value < 100 ? design.align || 'center' : design.align } })}>{value === 100 ? 'Full width' : `${value}%`}<Check checked={width === value} /></DropdownMenuItem>)}
        </Menu>
        <Menu label={`Height: ${height <= 160 ? 'Short' : height >= 340 ? 'Tall' : 'Medium'}`}>
          {[[160, 'Short'], [240, 'Medium'], [360, 'Tall']].map(([value, label]) => <DropdownMenuItem key={value} onClick={() => patch({ design: { ...design, height: value } })}>{label}<Check checked={height === value} /></DropdownMenuItem>)}
        </Menu>
        <Tool label="Fill" active={design.fit === 'cover'} title="Crop to fill the space" onClick={() => patch({ design: { ...design, fit: design.fit === 'cover' ? 'contain' : 'cover' } })} />
        <FieldsMenu label="Alt text" fields={[{ key: 'alt', label: 'Describe the image for screen readers', value: content.alt || '' }]} onChange={(_, value) => patch({ content: { ...content, alt: value } })} />
        {motion}{actions}
      </>
    )
  }
  if (block.type === 'card_deck') {
    const cards: any[] = content.cards || []
    return (
      <>
        <Name>Card deck</Name>
        <Tool label="Card" onClick={() => patch({ content: { ...content, cards: [...cards, { id: createOptionId(), title: '', body: '' }] } })}><Plus size={14} /></Tool>
        <FieldsMenu label="Paste a list" fields={[{ key: 'list', label: 'One card per line. "Name: one sentence" puts the sentence under the name.', value: cards.map((card) => `${card.title || ''}${card.body ? `: ${card.body}` : ''}`).join('\n'), multiline: true }]} onChange={(_, value) => {
          const lines = value.split('\n').map((line) => line.trim()).filter(Boolean)
          patch({ content: { ...content, cards: lines.map((line, index) => {
            const [title, ...rest] = line.split(':')
            return { id: cards[index]?.id || createOptionId(), title: title.trim(), body: rest.join(':').trim() }
          }) } })
        }} />
        <span className="shrink-0 px-1 text-xs text-gray-500">{cards.length} cards</span>
        {motion}{actions}
      </>
    )
  }
  if (block.type === 'column_break') {
    return <><Name>Column break</Name><span className="px-2 text-xs text-gray-500">On wide screens, what&apos;s above goes on the left and what&apos;s below on the right. Drag it to change the split.</span>{actions}</>
  }
  if (block.type === 'button') {
    return (
      <>
        <Name>Button</Name>
        <FieldsMenu label="Label" fields={[{ key: 'label', label: 'Button label', value: content.label || '' }]} onChange={(_, value) => patch({ content: { ...content, label: value } })} />
        <Tool label="Beside Continue" active={design.placement === 'footer'} title="Show it at the bottom, beside Continue" onClick={() => patch({ design: { ...design, placement: design.placement === 'footer' ? undefined : 'footer' } })} />
        <Tool label="Branch on it" onClick={() => onBranchFrom(block)}><GitBranch size={14} className="text-violet-600" /></Tool>
        {motion}{actions}
      </>
    )
  }
  if (block.type === 'question') {
    const completion = block.completion || {}
    const branch = <><KeepMenu block={block} variables={info.variables} onPatch={patch} onCreateDetail={info.onCreateDetail} /><Tool label="Branch" onClick={() => onBranchFrom(block)}><GitBranch size={14} className="text-violet-600" /></Tool></>
    if (block.kind === 'multiple_choice' || block.kind === 'categorized_multi_select') {
      const options: any[] = content.options || []
      const several = Number(completion.max_selections || 1) > 1
      const look = design.style || 'list'
      return (
        <>
          <Name>{block.kind === 'categorized_multi_select' ? 'Sorted choice' : 'Choice'}</Name>
          <span className="flex shrink-0 rounded-lg border border-gray-200 p-0.5" role="group" aria-label="How many">
            <button type="button" aria-pressed={!several} onClick={() => patch({ completion: { ...completion, max_selections: 1, min_selections: 1 } })} className={`h-7 rounded-md px-2 text-xs font-bold ${!several ? on : 'text-gray-600 hover:bg-gray-100'}`}>Pick one</button>
            <button type="button" aria-pressed={several} onClick={() => patch({ completion: { ...completion, max_selections: Math.max(2, options.length), min_selections: 1 } })} className={`h-7 rounded-md px-2 text-xs font-bold ${several ? on : 'text-gray-600 hover:bg-gray-100'}`}>Pick several</button>
          </span>
          {block.kind === 'multiple_choice' && (
            <Menu label={`Look: ${({ list: 'List', pills: 'Pills', cards: 'Cards', scale: 'Scale' } as Record<string, string>)[look]}`}>
              {[['list', 'List', 'Full-width rows'], ['pills', 'Pills', 'Compact, wraps'], ['cards', 'Cards', 'With an emoji and a line'], ['scale', 'Scale', 'From the first option to the last']].map(([value, label, help]) => (
                <DropdownMenuItem key={value} onClick={() => patch({ design: { ...design, style: value === 'list' ? undefined : value } })}>
                  <span><span className="block">{label}</span><span className="block text-xs text-gray-500">{help}</span></span><Check checked={look === value} />
                </DropdownMenuItem>
              ))}
            </Menu>
          )}
          <Tool label="Option" onClick={() => patch({ content: { ...content, options: [...options, { id: createOptionId(), text: `Option ${options.length + 1}` }] } })}><Plus size={14} /></Tool>
          <Sep />{branch}{motion}{actions}
        </>
      )
    }
    if (block.kind === 'text_input') {
      const inputs: any[] = content.inputs || []
      const first = inputs[0] || {}
      const rules = completion.inputs || {}
      const required = inputs.every((input) => rules[input.id]?.required !== false)
      const long = first.variant === 'long_answer'
      return (
        <>
          <Name>Text answer</Name>
          <FieldsMenu label="Hint text" fields={[{ key: 'placeholder', label: 'Shown inside the box', value: first.placeholder || '' }]} onChange={(_, value) => patch({ content: { ...content, inputs: inputs.map((input, index) => index === 0 ? { ...input, placeholder: value } : input) } })} />
          <Tool label={long ? 'Long answer' : 'Short answer'} title="Switch between a line and a box" onClick={() => patch({ content: { ...content, inputs: inputs.map((input) => ({ ...input, variant: long ? 'short_answer' : 'long_answer' })) } })} />
          <Tool label="Required" active={required} onClick={() => patch({ completion: { ...completion, inputs: Object.fromEntries(inputs.map((input) => [input.id, { ...(rules[input.id] || {}), required: !required }])) } })} />
          <Tool title={inputs.length > 1 ? 'Back to one box' : 'Two boxes side by side'} active={inputs.length > 1} onClick={onToggleSideBySide}><Columns2 size={15} /></Tool>
          <Sep />{branch}{motion}{actions}
        </>
      )
    }
    if (block.kind === 'image_upload') {
      return (
        <>
          <Name>Upload</Name>
          <Tool label="Required" active={completion.required !== false} onClick={() => patch({ completion: { ...completion, required: completion.required === false } })} />
          <Sep /><KeepMenu block={block} variables={info.variables} onPatch={patch} onCreateDetail={info.onCreateDetail} />
          {motion}{actions}
        </>
      )
    }
  }
  return <><Name>{blockLabel(block)}</Name>{motion}{actions}</>
}
