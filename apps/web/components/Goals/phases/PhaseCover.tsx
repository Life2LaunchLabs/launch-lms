'use client'

import React from 'react'
import useSWR from 'swr'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { lifeApi, lifeUrl, type Phase, type PlacePhoto } from '@services/life/life'
import PhaseScene from './PhaseScene'

/** Photos of places by place key, from the life plan catalog (shared with the budget's copy). */
export function usePlacePhotos(token?: string) {
  const { data } = useSWR(token ? lifeUrl('/catalog') : null, () => lifeApi.catalog(token), { revalidateOnFocus: false })
  return data?.place_photos
}

/** What a phase's cover shows: the learner's own photo, else its place's photo, else nothing (a drawing). */
export function coverOf(phase: Pick<Phase, 'cover' | 'place'>, photos?: Record<string, PlacePhoto>): { url: string; credit: PlacePhoto | null } | null {
  if (phase.cover?.url) return { url: phase.cover.url, credit: null }
  const photo = phase.place ? photos?.[phase.place] : undefined
  return photo ? { url: photo.url, credit: photo } : null
}

/** The picture behind a phase's name: a photo when there is one, with the drawn landscape as the fallback. */
export default function PhaseCover({ phase, photos, past = false, className }: { phase: Pick<Phase, 'cover' | 'place' | 'kind'>; photos?: Record<string, PlacePhoto>; past?: boolean; className?: string }) {
  const cover = coverOf(phase, photos)
  const [failed, setFailed] = React.useState<string | null>(null)
  if (!cover || failed === cover.url) return <PhaseScene kind={phase.kind} past={past} className={className} />
  return <img src={cover.url} alt="" loading="lazy" decoding="async" onError={() => setFailed(cover.url)}
    className={cn('object-cover', past && 'saturate-[.55]', className)} />
}

/**
 * The credit for a place photo: a small info mark in the corner that opens to the author and
 * license on hover, focus or tap, linking to the photo's page on Wikimedia Commons.
 */
export function PhotoCredit({ phase, photos, className }: { phase: Pick<Phase, 'cover' | 'place'>; photos?: Record<string, PlacePhoto>; className?: string }) {
  const [open, setOpen] = React.useState(false)
  const credit = coverOf(phase, photos)?.credit
  if (!credit) return null
  return <span className={cn('group/credit absolute z-10 flex items-center justify-end', className)} onMouseLeave={() => setOpen(false)}>
    <span className={cn('flex max-w-[min(320px,80vw)] items-center gap-1.5 overflow-hidden rounded-full bg-black/45 text-[11px] font-semibold text-white backdrop-blur transition-all',
      open ? 'py-1 pl-3 pr-1' : 'p-0 group-hover/credit:py-1 group-hover/credit:pl-3 group-hover/credit:pr-1 group-focus-within/credit:py-1 group-focus-within/credit:pl-3 group-focus-within/credit:pr-1')}>
      <a href={credit.source_url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}
        className={cn('truncate hover:underline', open ? 'block' : 'hidden group-hover/credit:block group-focus-within/credit:block')}>
        Photo: {credit.author} · {credit.license} · Wikimedia Commons
      </a>
      <button type="button" aria-label="Photo credit" aria-expanded={open} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen((value) => !value) }}
        className="grid size-6 shrink-0 place-items-center rounded-full text-white/90 hover:text-white">
        <Info size={14} aria-hidden="true" />
      </button>
    </span>
  </span>
}
