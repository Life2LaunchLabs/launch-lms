'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@components/ui/button'
import { BadgeSticker } from '@components/Badges/discover/BadgeArt'
import { getUriWithOrg } from '@services/config/config'
import type { DiscoverHeroSlide } from '@services/learning/badgeDiscover'
import { cn } from '@/lib/utils'

const DURATION_MS = 7000

function HeroArtwork({ slide }: { slide: DiscoverHeroSlide }) {
  if (slide.image_url) return <><img src={slide.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/5 md:bg-gradient-to-r" /></>
  if (slide.kind === 'badge' && slide.badge) return <>
    <div className="absolute inset-0 bg-[url('/rough_blue_background.png')] bg-cover opacity-40" />
    <div className="absolute right-4 top-6 -rotate-6 md:right-10 md:top-1/2 md:-translate-y-1/2" aria-hidden="true"><BadgeSticker src={slide.badge.thumbnail_image} name={slide.title} size={150} className="md:!h-[210px] md:!w-[210px]" /></div>
  </>
  if (slide.collection) return <div className="absolute right-4 top-4 flex md:right-10 md:top-1/2 md:-translate-y-1/2" aria-hidden="true">{slide.collection.badges.slice(0, 3).map((badge, index) => <div key={badge.badge_uuid} className="-ml-10 first:ml-0" style={{ transform: `rotate(${index * 12 - 12}deg)` }}><BadgeSticker src={badge.thumbnail_image} name={badge.name} size={110} /></div>)}</div>
  return null
}

function usePrefersReducedMotion() {
  return React.useSyncExternalStore(
    (onChange) => { const query = window.matchMedia('(prefers-reduced-motion: reduce)'); query.addEventListener('change', onChange); return () => query.removeEventListener('change', onChange) },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => true,
  )
}

/**
 * Featured stories at the top of Discover. Slides advance on their own, with a segmented
 * timer showing how long until the next; hovering, focusing or touching pauses, and
 * reduced motion turns autoplay off.
 */
export default function DiscoverHero({ slides = [], orgslug }: { slides?: DiscoverHeroSlide[]; orgslug: string }) {
  const [index, setIndex] = React.useState(0)
  const [hovered, setHovered] = React.useState(false)
  const [focused, setFocused] = React.useState(false)
  const [touching, setTouching] = React.useState(false)
  const touchX = React.useRef<number | null>(null)
  const reducedMotion = usePrefersReducedMotion()
  const count = slides.length
  const slide = slides[Math.min(index, count - 1)]
  if (!slide) return null
  const autoplay = count > 1 && !reducedMotion
  const paused = hovered || focused || touching
  const go = (next: number) => setIndex(((next % count) + count) % count)
  const light = slide.theme === 'light' && !slide.image_url
  const href = slide.href.startsWith('/') ? getUriWithOrg(orgslug, slide.href) : slide.href

  return <section aria-roledescription="carousel" aria-label="Featured in Discover"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false) }}
    onTouchStart={(event) => { setTouching(true); touchX.current = event.touches[0].clientX }}
    onTouchEnd={(event) => { setTouching(false); const start = touchX.current; touchX.current = null; if (start === null) return; const delta = event.changedTouches[0].clientX - start; if (Math.abs(delta) > 48) go(index + (delta < 0 ? 1 : -1)) }}
    className={cn('relative flex min-h-[360px] overflow-hidden rounded-3xl md:min-h-[420px]', light ? 'bg-raised text-foreground' : slide.theme === 'blue' ? 'bg-[#2F66D6] text-white' : 'bg-shell text-white')}>
    <HeroArtwork key={slide.key} slide={slide} />
    {count > 1 ? <div className="absolute inset-x-5 top-4 z-20 flex gap-1.5" role="group" aria-label="Choose a featured story">
      {slides.map((item, position) => <button key={item.key} type="button" onClick={() => go(position)} aria-label={`Story ${position + 1} of ${count}: ${item.title}`} aria-current={position === index || undefined} className="flex h-6 flex-1 items-center">
        <span className={cn('block h-1.5 w-full overflow-hidden rounded-full', light ? 'bg-foreground/15' : 'bg-white/30')}>
          {position < index || (position === index && !autoplay) ? <span className={cn('block h-full w-full rounded-full', light ? 'bg-foreground' : 'bg-white')} /> : null}
          {position === index && autoplay ? <span key={`${item.key}-${index}`} onAnimationEnd={() => go(index + 1)} className={cn('discover-hero-timer block h-full w-full rounded-full', light ? 'bg-foreground' : 'bg-white')} style={{ '--hero-duration': `${DURATION_MS}ms`, animationPlayState: paused ? 'paused' : 'running' } as React.CSSProperties} /> : null}
        </span>
      </button>)}
    </div> : null}
    <div aria-live={autoplay && !paused ? 'off' : 'polite'} className="relative z-10 mt-auto flex w-full flex-col items-start gap-3 p-6 pt-16 md:max-w-[62%] md:p-10">
      <p className="text-xs font-extrabold uppercase tracking-widest opacity-90">{slide.eyebrow}</p>
      <h2 className="text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">{slide.title}</h2>
      {slide.description ? <p className="line-clamp-3 max-w-lg text-sm leading-6 opacity-90 md:text-base">{slide.description}</p> : null}
      {href ? <Button asChild variant="surface" size="tall" className="mt-2 border-0 bg-white text-[#10181c] shadow-[0_4px_0_rgba(0,0,0,.35)] hover:bg-white/90"><Link href={href}>{slide.action_label || 'Learn more'}</Link></Button> : <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">Coming soon</span>}
    </div>
  </section>
}
