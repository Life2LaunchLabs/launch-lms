'use client'

import Link from 'next/link'
import React from 'react'

function ContentHeroSection({
  eyebrow,
  title,
  body,
  image,
  children,
  backgroundClassName = '',
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  body?: React.ReactNode
  image?: React.ReactNode
  children?: React.ReactNode
  backgroundClassName?: string
}) {
  return (
    <section
      className={`mb-8 overflow-hidden rounded-lg px-6 py-6 text-white ${backgroundClassName}`}
      style={{ backgroundColor: 'var(--org-primary-color, #8b5cf6)' }}
    >
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div
              className="mb-4 inline-flex rounded-md bg-white px-2 py-1 text-xs font-bold uppercase tracking-wide"
              style={{ color: 'var(--org-primary-color, #8b5cf6)' }}
            >
              {eyebrow}
            </div>
          )}
          <h1 className="text-2xl font-bold leading-tight tracking-normal sm:text-3xl">
            {title}
          </h1>
          {body && (
            <p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-white/75 sm:text-base">
              {body}
            </p>
          )}
        </div>
        {image && (
          <div className="hidden aspect-square w-28 shrink-0 overflow-hidden rounded-lg bg-white/15 ring-1 ring-white/20 sm:block">
            {image}
          </div>
        )}
      </div>
      {children && <div className="mt-8">{children}</div>}
    </section>
  )
}

export function ContentHeroButton({
  href,
  label,
}: {
  href: string
  label: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center rounded-lg bg-white px-5 text-sm font-bold text-gray-950 transition-colors hover:bg-white/90"
    >
      {label}
    </Link>
  )
}

export function ContentHeroSegmentedProgress({
  directive,
  earned,
  inProgress,
  total,
}: {
  directive: React.ReactNode
  earned: number
  inProgress: number
  total: number
}) {
  const earnedWidth = total > 0 ? (earned / total) * 100 : 0
  const inProgressWidth = total > 0 ? (inProgress / total) * 100 : 0

  return (
    <div className="rounded-lg bg-white/20 px-5 py-4 ring-1 ring-white/20">
      <div className="mb-4 text-sm font-bold text-white">{directive}</div>
      <div
        className="flex h-6 overflow-hidden rounded-full bg-white/25"
        aria-label={`${earned} earned and ${inProgress} in progress out of ${total} badges`}
      >
        <div className="h-full bg-white" style={{ width: `${earnedWidth}%` }} />
        <div className="h-full bg-white/55" style={{ width: `${inProgressWidth}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-bold">
        <span className="text-white">{earned} earned</span>
        <span className="text-white/70">{inProgress} in progress</span>
      </div>
    </div>
  )
}

export default ContentHeroSection
