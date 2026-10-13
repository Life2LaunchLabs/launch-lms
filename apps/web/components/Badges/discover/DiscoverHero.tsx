'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Newspaper, Sparkles } from 'lucide-react'
import { Button } from '@components/ui/button'
import { getUriWithOrg } from '@services/config/config'
import type { DiscoverHeroSlide } from '@services/learning/badgeDiscover'
import { cn } from '@/lib/utils'
import { BadgeSticker } from './BadgeArt'

function SlideThumbnail({ slide }: { slide: DiscoverHeroSlide }) {
  if (slide.kind === 'badge') return <BadgeSticker src={slide.thumbnail_url} name={slide.title} size={48} />
  const image = slide.thumbnail_url || slide.image_url || slide.collection?.badges[0]?.thumbnail_image
  return image ? <img src={image} alt="" className="h-full w-full object-cover" /> : slide.kind === 'news' ? <Newspaper size={24} /> : <Sparkles size={24} />
}

function HeroArtwork({ slide }: { slide: DiscoverHeroSlide }) {
  if (slide.image_url) return <><img src={slide.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-black/10" /></>
  if (slide.kind === 'badge' && slide.badge) return <>
    <div className="absolute inset-0 bg-[url('/rough_blue_background.png')] bg-cover opacity-40" />
    <div className="absolute right-6 top-1/2 hidden -translate-y-1/2 -rotate-6 @[900px]:block" aria-hidden="true"><BadgeSticker src={slide.badge.thumbnail_image} name={slide.title} size={200} /></div>
  </>
  if (slide.collection) return <div className="absolute right-4 top-1/2 hidden -translate-y-1/2 @[900px]:block" aria-hidden="true">{slide.collection.badges.slice(0, 3).map((badge, index) => <div key={badge.badge_uuid} className="-mt-6" style={{ transform: `rotate(${index * 12 - 12}deg)` }}><BadgeSticker src={badge.thumbnail_image} name={badge.name} size={130} /></div>)}</div>
  return null
}

/** Editorial hero: image-led story, quiet vertical selectors, backend-owned content. */
export default function DiscoverHero({ slides = [], orgslug }: { slides?: DiscoverHeroSlide[]; orgslug: string }) {
  const [selected, setSelected] = useState('')
  const slide = slides.find((item) => item.key === selected) || slides[0]
  if (!slide) return null
  const light = slide.theme === 'light' && !slide.image_url
  const href = slide.href.startsWith('/') ? getUriWithOrg(orgslug, slide.href) : slide.href
  return <section className="@container" aria-label="Featured in Discover">
    <div className="grid min-w-0 gap-4 @[900px]:grid-cols-[minmax(0,1fr)_220px]">
      <article className={cn('relative flex min-h-[380px] min-w-0 items-end overflow-hidden rounded-2xl @[900px]:min-h-[500px]', light ? 'bg-muted text-foreground' : slide.theme === 'blue' ? 'bg-[#2E62C9] text-white' : 'bg-muted text-white')} aria-live="polite">
        {!slide.image_url && !light && slide.theme !== 'blue' ? <div className="absolute inset-0 bg-gradient-to-br from-[#242936] to-[#10121a]" /> : null}
        <HeroArtwork slide={slide} />
        <div className={cn('relative z-10 w-full space-y-4 p-6 sm:p-8', !slide.image_url && (slide.badge || slide.collection) && '@[900px]:max-w-[65%]')}>
          <p className="text-xs font-bold uppercase tracking-widest">{slide.eyebrow}</p>
          <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{slide.title}</h2>
          {slide.description ? <p className="max-w-lg text-sm leading-6 sm:text-base">{slide.description}</p> : null}
          {href ? <Button asChild size="lg" className={cn('mt-2 rounded-xl', !light && 'bg-white text-black hover:bg-white/90')}><Link href={href}>{slide.action_label || 'Learn more'}</Link></Button> : <span className="inline-flex rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">Coming soon</span>}
        </div>
      </article>
      <div className="flex min-w-0 gap-2 overflow-x-auto @[900px]:flex-col" role="group" aria-label="Choose a featured story">
        {slides.map((item) => <button key={item.key} type="button" onClick={() => setSelected(item.key)} aria-pressed={item.key === slide.key} className={cn('flex min-h-20 min-w-52 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left text-foreground transition-colors hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 @[900px]:min-w-0 @[900px]:flex-none @[900px]:min-h-24', item.key === slide.key && 'bg-muted')}>
          <span className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted" aria-hidden="true"><SlideThumbnail slide={item} /></span>
          <span className="min-w-0"><span className="line-clamp-2 text-sm font-semibold leading-5">{item.kind === 'challenges' ? 'Monthly challenges' : item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{item.eyebrow}</span></span>
        </button>)}
      </div>
    </div>
  </section>
}
