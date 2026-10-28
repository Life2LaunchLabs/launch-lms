'use client'

import React from 'react'
import { Loader2, Play, Search } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { cn } from '@/lib/utils'
import type { MediaAsset } from '@services/media/library'
import { type StockItem, type StockKind, type StockOrientation, importStockMedia, searchStockMedia } from '@services/media/stock'

const IDEAS = ['friends laughing', 'students outdoors', 'skateboarding', 'graduation', 'creative studio', 'first job', 'road trip', 'teamwork']
const ORIENTATIONS: Array<{ value: StockOrientation | ''; label: string }> = [
  { value: '', label: 'Any shape' }, { value: 'landscape', label: 'Wide' }, { value: 'portrait', label: 'Tall' }, { value: 'square', label: 'Square' },
]

type Props = {
  orgId: number
  kind: StockKind
  accessToken?: string
  // eslint-disable-next-line no-unused-vars
  onPick: (asset: MediaAsset) => Promise<void> | void
}

export function duration(seconds?: number | null) {
  if (!seconds) return ''
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Search free stock photos or videos; picking one copies it into the org's media library with its credit. */
export default function StockMediaTab({ orgId, kind, accessToken, onPick }: Props) {
  const [query, setQuery] = React.useState('')
  const [searched, setSearched] = React.useState('')
  const [orientation, setOrientation] = React.useState<StockOrientation | ''>('')
  const [items, setItems] = React.useState<StockItem[]>([])
  const [page, setPage] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [adding, setAdding] = React.useState<string | null>(null)
  const [error, setError] = React.useState('')
  const noun = kind === 'video' ? 'videos' : 'photos'

  const run = async (text: string, nextPage = 1, shape = orientation) => {
    const q = text.trim()
    if (!q || !accessToken) return
    setLoading(true)
    setError('')
    try {
      const result = await searchStockMedia(orgId, q, kind, accessToken, { orientation: shape || undefined, page: nextPage })
      setItems((current) => nextPage === 1 ? result.items : [...current, ...result.items])
      setPage(nextPage)
      setHasMore(result.has_more)
      setSearched(q)
    } catch (err: any) {
      setError(err?.message || `Could not search stock ${noun}.`)
    } finally {
      setLoading(false)
    }
  }

  const pick = async (item: StockItem) => {
    if (!accessToken || adding) return
    setAdding(item.id)
    setError('')
    try {
      await onPick(await importStockMedia(orgId, item, accessToken, { title: item.alt || undefined }))
    } catch (err: any) {
      setError(err?.message || 'Could not add it to your media library.')
    } finally {
      setAdding(null)
    }
  }

  return <div className="flex flex-col gap-4 px-5 py-5 sm:px-8">
    <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void run(query) }}>
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search free ${noun}`} aria-label={`Search free ${noun}`} className="h-10 pl-9" />
      </div>
      <div className="flex gap-2">
        <select value={orientation} aria-label="Shape" onChange={(event) => { const shape = event.target.value as StockOrientation | ''; setOrientation(shape); if (searched) void run(searched, 1, shape) }}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm">
          {ORIENTATIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <Button type="submit" disabled={loading || !query.trim()}>{loading && page === 1 ? <Loader2 className="size-4 animate-spin" /> : null}Search</Button>
      </div>
    </form>

    {!searched && !loading ? <div className="flex flex-wrap gap-1.5">
      {IDEAS.map((idea) => <button key={idea} type="button" onClick={() => { setQuery(idea); void run(idea) }}
        className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:border-foreground/40 hover:text-foreground">{idea}</button>)}
    </div> : null}

    {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    {searched && !loading && !items.length && !error ? <p className="text-sm text-muted-foreground">No {noun} for “{searched}”. Try other words.</p> : null}

    {items.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => <figure key={item.id} className="flex min-w-0 flex-col gap-1">
        <button type="button" onClick={() => void pick(item)} disabled={Boolean(adding)} aria-label={`Use ${item.alt || 'this ' + kind}`}
          className={cn('group relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted', adding && adding !== item.id && 'opacity-50')}>
          <img src={item.preview_url} alt={item.alt} loading="lazy" className="size-full object-cover transition group-hover:scale-[1.03]" />
          {kind === 'video' ? <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white"><Play className="size-3" aria-hidden="true" />{duration(item.duration)}</span> : null}
          <span className={cn('absolute inset-0 grid place-items-center bg-black/45 text-sm font-semibold text-white transition', adding === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
            {adding === item.id ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Adding</span> : 'Use this'}
          </span>
        </button>
        <figcaption className="truncate text-[11px] text-muted-foreground">
          <a href={item.credit.source_url || item.credit.url} target="_blank" rel="noreferrer" className="hover:underline">{item.credit.name || 'Unknown'}</a> on {item.credit.provider}
        </figcaption>
      </figure>)}
    </div> : null}

    {hasMore ? <Button type="button" variant="outline" className="self-center" disabled={loading} onClick={() => void run(searched, page + 1)}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}More {noun}
    </Button> : null}
    <p className="text-xs text-muted-foreground">Free to use from Pexels. Picking one adds it to your media library with its credit.</p>
  </div>
}
