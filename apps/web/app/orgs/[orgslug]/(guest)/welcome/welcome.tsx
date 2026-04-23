'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getUriWithOrg, routePaths } from '@services/config/config'

interface WelcomeClientProps {
  orgslug: string
}

const TORN_CARD_ASPECT_RATIO = 855 / 546
const CARD_VERTICAL_PADDING = 72

export default function WelcomeClient({ orgslug }: WelcomeClientProps) {
  const textContentRef = useRef<HTMLDivElement | null>(null)
  const [cardHeight, setCardHeight] = useState(546)
  const signupHref = getUriWithOrg(orgslug, routePaths.org.quickstart())
  const launchpadHref = getUriWithOrg(orgslug, '/signup')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    const node = textContentRef.current
    if (!node) return

    const updateCardHeight = () => {
      setCardHeight(node.offsetHeight + CARD_VERTICAL_PADDING)
    }

    updateCardHeight()

    const observer = new ResizeObserver(updateCardHeight)
    observer.observe(node)
    window.addEventListener('resize', updateCardHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateCardHeight)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[100] overflow-x-hidden overflow-y-auto">
      {/* Full-page background */}
      <div className="absolute inset-0">
        <Image
          src="/welcome_background.png"
          alt=""
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
      </div>

      {/* Centered card */}
      <div className="relative z-10 flex min-h-full justify-center px-0 py-10 md:px-6">
        <div
          className="relative mx-[-3rem] flex shrink-0 items-center justify-center self-center md:mx-0"
          style={{
            height: `${cardHeight}px`,
            width: `${cardHeight * TORN_CARD_ASPECT_RATIO}px`,
          }}
        >
          <Image
            src="/torn-paper-card.png"
            alt=""
            fill
            priority
            className="pointer-events-none select-none object-fill"
            sizes="(max-width: 768px) 100vw, 855px"
          />

          <div
            ref={textContentRef}
            className="relative z-10 flex w-full max-w-[26rem] flex-col items-start px-10 pt-12 pb-9 text-left md:px-16 md:pt-16 md:pb-12"
          >
            <h1
              className="font-black text-[28px] leading-none uppercase tracking-tight md:text-[48px]"
              style={{ color: '#218FFF' }}
            >
              Your life. Your way. Your launch.
            </h1>

            <p className="mt-2.5 w-full text-[12px] leading-relaxed text-gray-600 md:text-[13px]">
              Your next step isn't just about finding a career, it means finding a
              path that lets you channel your skills and interests! This quiz helps
              you find the clarity you need to choose your own path.
            </p>

            <Link
              href={signupHref}
              className="mt-4 rounded-full bg-gray-900 px-8 py-2 text-[11px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-gray-700"
            >
              Get Started
            </Link>

            <p className="mt-3.5 text-[11px] text-gray-400">
              ready to jump right into the launchpad?
            </p>

            <div className="mt-1.5 flex items-center gap-2 self-start">
              <Link
                href={launchpadHref}
                className="rounded-full border border-gray-400 px-5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-700 transition-colors hover:bg-gray-50"
              >
                Join the Launchpad
              </Link>

              <a
                href="https://www.life2launch.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-400 text-[10px] font-bold text-gray-500 transition-colors hover:bg-gray-100"
                aria-label="Learn more about Life2Launch"
              >
                ?
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
