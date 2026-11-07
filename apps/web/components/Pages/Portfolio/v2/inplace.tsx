'use client'

import Link from 'next/link'
import { type ComponentType, type ReactNode } from 'react'
import { ArrowLeft, ImageIcon, Plus, Trash2 } from 'lucide-react'

import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { Button } from '@components/ui/button'
import { type MediaAsset } from '@services/media/library'
import { normalizeMediaUrl } from '@services/media/media'
import { SpotTip } from './parts'

import { tr } from '@/lib/tr'
// The pieces an item's own page uses to edit in place: the page reads like the finished thing, every line
// is the field that sets it, what's missing waits as a dashed chip at the bottom, and one bar saves.

/** Text that reads like the page and edits on click. */
export const quiet = 'w-full rounded-xl bg-transparent px-2 -mx-2 outline-none transition placeholder:text-muted-foreground/60 hover:bg-muted/60 focus:bg-muted/70 focus:ring-2 focus:ring-[var(--org-primary-color)]/40'

/** Sets one value. */
// eslint-disable-next-line no-unused-vars
export type Setter<T> = (value: T) => void

/** An image picked for an item, as the media library returns it. */
export type Picked = MediaAsset

export function blockImages(blocks: Array<{ block_type: string; data: any }> = []): Picked[] {
  return blocks.filter((block) => block.block_type === 'image').map((block, index) => ({ id: index, asset_uuid: String(block.data.asset_uuid || ''), url: String(block.data.url || ''), title: String(block.data.caption || ''), owner_type: 'user' as const, source_type: 'upload' as const, media_type: 'image' as const, creation_date: '', update_date: '' } as MediaAsset))
}
export const imageBlocks = (images: Picked[]) => images.map((image) => ({ block_type: 'image', data: { asset_uuid: image.asset_uuid, url: image.url, caption: image.title || '' } }))

/** Back to the section, then the item: a wide cover with its own change button. */
export function ItemHero({ back, backLabel, cover, onCover, children }: { back: string; backLabel: string; cover: ReactNode; onCover?: () => void; children?: ReactNode }) {
  return <>
    <div className="flex h-14 items-center justify-between gap-3">
      <Link href={back} className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-bold hover:bg-muted"><ArrowLeft className="h-4 w-4" />{backLabel}</Link>
      {children}
    </div>
    <div className="relative aspect-[2/1] overflow-hidden rounded-[22px] sm:aspect-[16/6] border-2 border-border shadow-[0_4px_0_hsl(var(--border))]">
      {cover}
      {onCover ? <button type="button" onClick={onCover} className="absolute bottom-3 right-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-black/55 px-3.5 text-[13px] font-bold text-white backdrop-blur hover:bg-black/70"><ImageIcon className="h-4 w-4" />{tr('portfolio.inplace.change_cover', 'Change cover')}</button> : null}
    </div>
  </>
}

/** Something not added yet: a dashed chip that opens it. */
export function AddChip({ icon: Icon, children, onClick, mark }: { icon: ComponentType<{ className?: string }>; children: ReactNode; onClick: () => void; mark?: string }) {
  return <button type="button" onClick={onClick} className={`group relative inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-dashed px-3 text-[13px] font-bold transition hover:border-[var(--org-primary-color)] hover:text-foreground ${mark ? 'border-[#f29400] text-foreground' : 'border-border text-muted-foreground'}`}>
    {mark ? <SpotTip label={mark} className="absolute -right-2 -top-3.5" /> : null}
    <Icon className="h-4 w-4" />{children}
  </button>
}

/** One part of the item once it has something: a small heading and its content. */
export function ItemSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="grid gap-3">
    <div className="flex items-center justify-between gap-3"><h2 className="text-[17px] font-extrabold">{title}</h2>{action}</div>
    {children}
  </section>
}

/** Photos for an item: tap one to make it the cover, the bin takes it off. */
export function PhotoPicker({ images, setImages, cover, setCover, userId, token, open, setOpen, title }: { images: Picked[]; setImages: Setter<Picked[]>; cover: string; setCover: Setter<string>; userId: number; token?: string; open: boolean; setOpen: Setter<boolean>; title: string }) {
  function add(asset: MediaAsset) {
    if (!images.some((item) => item.asset_uuid === asset.asset_uuid)) setImages([...images, asset])
    if (!cover) setCover(asset.asset_uuid)
    setOpen(false)
  }
  return <>
    {images.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {images.map((image) => <div key={image.asset_uuid} className={`relative overflow-hidden rounded-2xl border-2 ${cover === image.asset_uuid ? 'border-[var(--org-primary-color)]' : 'border-transparent'}`}>
        <button type="button" onClick={() => setCover(image.asset_uuid)} className="block aspect-square w-full"><img src={normalizeMediaUrl(image.url)} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white">{cover === image.asset_uuid ? tr('portfolio.inplace.cover', 'Cover') : tr('portfolio.inplace.make_cover', 'Make cover')}</span></button>
        <button type="button" aria-label={tr('portfolio.inplace.remove_photo', 'Remove photo')} onClick={() => { const rest = images.filter((item) => item.asset_uuid !== image.asset_uuid); setImages(rest); if (cover === image.asset_uuid) setCover(rest[0]?.asset_uuid || '') }} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white"><Trash2 className="h-4 w-4" /></button>
      </div>)}
      <button type="button" onClick={() => setOpen(true)} className="grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:border-[var(--org-primary-color)] hover:text-foreground"><Plus className="h-6 w-6" /><span className="sr-only">{tr('portfolio.inplace.add_a_photo', 'Add a photo')}</span></button>
    </div> : null}
    <MediaPickerDialog open={open} onOpenChange={setOpen} title={title} description={tr('portfolio.inplace.upload_a_photo_or_choose', 'Upload a photo or choose one you\'ve used before.')} owner={{ type: 'user', id: userId }} mediaType="image" accessToken={token} onSave={add} />
  </>
}

/** The bar that keeps the item: always there for a new one, and once something changes on a saved one. */
export function SaveBar({ show, busy, label, mark, onCancel, cancelLabel = 'Cancel' }: { show: boolean; busy: boolean; label: string; mark?: string; onCancel?: () => void; cancelLabel?: string }) {
  if (!show) return null
  return <div className="sticky bottom-3 z-[5] mt-10 flex items-center justify-end gap-2 rounded-2xl border-2 border-border bg-card/95 p-2.5 shadow-[0_4px_0_hsl(var(--border))] backdrop-blur">
    {onCancel ? <Button type="button" variant="ghost" onClick={onCancel}>{cancelLabel}</Button> : null}
    <Marked mark={mark}><Button type="submit" variant="brand" className="h-11" disabled={busy}>{busy ? tr('portfolio.portfolio_header_parts.saving', 'Saving…') : label}</Button></Marked>
  </div>
}

/** The control that finishes a quest step, carrying the step's gold "!" when the learner came here for it. */
export function Marked({ mark, children }: { mark?: string; children: ReactNode }) {
  if (!mark) return <>{children}</>
  return <span className="group relative inline-flex rounded-2xl ring-4 ring-[#ffc21a]/45">
    <SpotTip label={mark} className="absolute -left-3 -top-3.5" />
    {children}
  </span>
}
