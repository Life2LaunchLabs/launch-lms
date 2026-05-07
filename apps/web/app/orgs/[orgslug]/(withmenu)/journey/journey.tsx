'use client'

import React, { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Link2 } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg } from '@services/config/config'

type ActionCard = {
  id: string
  url: string
  title: string
  subtext: string
  imageUrl: string
  textTone: 'dark' | 'light'
}

type JourneyClientProps = {
  displayName: string
  orgslug: string
}

const demoActions: ActionCard[] = [
  {
    id: 'demo-continue',
    url: '/courses',
    title: 'Continue learning',
    subtext: 'Pick up where your most recent course left off.',
    imageUrl: '',
    textTone: 'dark',
  },
  {
    id: 'demo-reflect',
    url: '/profile/timeline',
    title: 'Capture a reflection',
    subtext: 'Add a quick note about what is starting to click.',
    imageUrl: '',
    textTone: 'dark',
  },
  {
    id: 'demo-identity',
    url: '/profile',
    title: 'Shape your profile',
    subtext: 'Tune the story others see when they visit your work.',
    imageUrl: '',
    textTone: 'dark',
  },
]

const hexToRgba = (hex: string, alpha: number): string => {
  if (!hex || hex.length < 7) return 'white'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function normalizeUrl(url?: string) {
  if (!url) return '#'
  if (url.startsWith('/') || url.startsWith('#')) return url
  if (/^https?:\/\//i.test(url)) return url
  return `https://${url}`
}

function getDisplayUrl(url?: string) {
  if (!url) return 'Open'
  if (url.startsWith('/')) return url.replace(/^\//, '') || 'Home'

  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function getCardImage(card?: ActionCard) {
  return card?.imageUrl || ''
}

function getToneClasses(tone: ActionCard['textTone']) {
  if (tone === 'light') {
    return {
      title: 'text-white placeholder:text-white/70',
      body: 'text-white/90 placeholder:text-white/70',
      link: 'text-white hover:text-white',
      muted: 'text-white/75',
      line: 'border-white/25',
      topGradient: 'from-black/60',
      bottomGradient: 'from-black/80',
    }
  }

  return {
    title: 'text-gray-950 placeholder:text-gray-500',
    body: 'text-gray-800 placeholder:text-gray-500',
    link: 'text-gray-950 hover:text-gray-950',
    muted: 'text-gray-700',
    line: 'border-gray-950/15',
    topGradient: 'from-white/85',
    bottomGradient: 'from-white/95',
  }
}

function ActionDisplayCard({
  card,
  active,
  orgslug,
}: {
  card: ActionCard
  active: boolean
  orgslug: string
}) {
  const image = getCardImage(card)
  const tone = getToneClasses(card.textTone)
  const href = card.url.startsWith('/') ? getUriWithOrg(orgslug, card.url) : normalizeUrl(card.url)

  return (
    <div
      className={`relative flex h-[270px] w-[min(82vw,360px)] flex-col overflow-hidden rounded-[28px] border bg-white p-1 transition-all duration-300 sm:h-[285px] sm:w-[380px] ${
        active ? 'border-[3px] border-gray-950' : 'border border-gray-200'
      }`}
    >
      {image ? (
        <img src={image} alt="" className="absolute inset-1 h-[calc(100%-8px)] w-[calc(100%-8px)] rounded-[24px] object-cover" />
      ) : (
        <div className="absolute inset-1 rounded-[24px] bg-[linear-gradient(135deg,#eef2ff,#f8fafc,#dcfce7)]" />
      )}
      <div className={`absolute inset-x-1 top-1 h-32 rounded-t-[24px] bg-gradient-to-b ${tone.topGradient} to-transparent`} />
      <div className={`absolute inset-x-1 bottom-1 h-32 rounded-b-[24px] bg-gradient-to-t ${tone.bottomGradient} to-transparent`} />
      <div className="relative flex min-h-0 flex-1 flex-col p-5">
        <div className="space-y-2">
          <h3 className={`text-2xl font-black leading-none ${tone.title}`}>
            {card.title || 'Featured link'}
          </h3>
          {card.subtext ? (
            <p className={`text-lg leading-7 ${tone.body}`}>{card.subtext}</p>
          ) : null}
        </div>
        <div className={`mt-auto border-t pt-3 ${tone.line}`}>
          <a
            href={href}
            className={`flex items-center gap-2 text-base font-semibold hover:underline ${tone.link}`}
          >
            <Link2 className="h-4 w-4" />
            <span className="truncate">{getDisplayUrl(card.url)}</span>
          </a>
        </div>
      </div>
    </div>
  )
}

function ActionCarousel({ cards, orgslug }: { cards: ActionCard[]; orgslug: string }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const mobileScrollerRef = useRef<HTMLDivElement | null>(null)

  const moveTo = (index: number) => {
    if (!cards.length) return
    setActiveIndex((index + cards.length) % cards.length)
  }

  const handleMobileScroll = () => {
    const scroller = mobileScrollerRef.current
    if (!scroller || cards.length === 0) return
    const scrollerCenter = scroller.scrollLeft + scroller.clientWidth / 2
    let closestIndex = 0
    let closestDistance = Number.POSITIVE_INFINITY

    Array.from(scroller.children).forEach((child, index) => {
      const element = child as HTMLElement
      const childCenter = element.offsetLeft + element.offsetWidth / 2
      const distance = Math.abs(childCenter - scrollerCenter)
      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = index
      }
    })

    setActiveIndex(closestIndex)
  }

  return (
    <div className="relative flex flex-col items-center overflow-visible py-2">
      <div
        ref={mobileScrollerRef}
        onScroll={handleMobileScroll}
        className="scrollbar-hide -mx-4 flex w-screen snap-x snap-mandatory gap-4 overflow-x-auto px-[9vw] pb-4 sm:mx-0 sm:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card, index) => (
          <div key={`mobile-${card.id}`} className="snap-center">
            <ActionDisplayCard card={card} active={index === activeIndex} orgslug={orgslug} />
          </div>
        ))}
      </div>

      <div className="relative hidden h-[290px] w-full items-center justify-center sm:flex sm:h-[305px]">
        {cards.map((card, index) => {
          const offset = index - activeIndex
          if (Math.abs(offset) > 2) return null
          const active = offset === 0
          return (
            <div
              key={`desktop-${card.id}`}
              className="absolute hidden transition-all duration-300 sm:block"
              style={{
                transform: active
                  ? 'translateX(0) scale(1)'
                  : `translateX(${offset * 76}px) scale(${1 - Math.abs(offset) * 0.08})`,
                opacity: active ? 1 : 0.42 - Math.abs(offset) * 0.1,
                zIndex: 10 - Math.abs(offset),
              }}
            >
              <ActionDisplayCard card={card} active={active} orgslug={orgslug} />
            </div>
          )
        })}
        {cards.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous featured card"
              onClick={() => moveTo(activeIndex - 1)}
              className="absolute left-1/2 z-30 hidden h-11 w-11 -translate-x-[250px] items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-md hover:bg-white sm:flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next featured card"
              onClick={() => moveTo(activeIndex + 1)}
              className="absolute right-1/2 z-30 hidden h-11 w-11 translate-x-[250px] items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-md hover:bg-white sm:flex"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}
      </div>
      {cards.length > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-2">
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              aria-label={`Show featured card ${index + 1}`}
              onClick={() => moveTo(index)}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                index === activeIndex ? 'bg-gray-950' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function JourneyClient({ displayName, orgslug }: JourneyClientProps) {
  const org = useOrg() as any
  const primaryColor = org?.config?.config?.customization?.general?.color || org?.config?.config?.general?.color || ''
  const siteBackground = primaryColor ? hexToRgba(primaryColor, 0.05) : 'white'

  return (
    <main className="min-h-screen w-full">
      <section className="relative px-0 pt-0 md:px-6 md:pt-6 lg:px-8">
        <div className="mx-auto w-full max-w-(--breakpoint-2xl)">
          <div
            className="relative flex h-[calc(100svh-220px)] max-h-[560px] min-h-[500px] w-full overflow-hidden md:h-[calc(100svh-220px)] md:max-h-[620px] md:min-h-[500px] md:rounded-[28px]"
          >
            <img
              src="/jungle_landscape.jpg"
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-white/10" />
            <div className="relative flex h-full w-full flex-col px-5 pb-0 pt-7 md:px-8 md:pb-8 md:pt-8 lg:px-10">
              <div className="max-w-[520px]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/40">
                  My Dashboard
                </p>
                <h1 className="mt-1 text-xl font-bold tracking-tight text-gray-900 md:text-2xl">
                  Welcome back, {displayName}
                </h1>
              </div>

              <div className="mt-auto flex w-full justify-center">
                <div className="w-full max-w-[920px] pb-4 text-center md:pb-0">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-900/55">
                    What&apos;s next?
                  </p>
                  <ActionCarousel cards={demoActions} orgslug={orgslug} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="relative z-10 -mt-8 rounded-t-[32px] px-5 pb-20 pt-12 md:mt-0 md:rounded-t-none md:px-6 md:pt-12 lg:px-8"
        style={{ backgroundColor: siteBackground }}
      >
        <div className="mx-auto grid w-full max-w-(--breakpoint-2xl) gap-8 lg:grid-cols-2">
          <section className="min-h-[260px]">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-950">My Identity</h2>
          </section>
          <section className="min-h-[260px]">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-950">My Path</h2>
          </section>
        </div>
      </section>
    </main>
  )
}
