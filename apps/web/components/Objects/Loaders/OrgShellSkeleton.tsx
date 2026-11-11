import React from 'react'
import { Skeleton } from '@components/ui/skeleton'
import { isFocusedActivityPath } from '@services/routing/learnerExperience'

/**
 * What an org's pages show while the organization itself loads: placeholder cards in the shape
 * of the page about to appear (the side menu, a page heading and cards), so the site looks
 * there and ready to pop in instead of white. The server renders it too, so the first paint
 * is this, not a blank page.
 */
export type OrgShellKind = 'learner' | 'admin' | 'focused'

/** Guest pages that open without the menu (set-up flows, previews, quotes, shared captures). */
const MENULESS = /^\/(first-phase|joined|for-organizations|preview|quote|insights\/shared)(\/|$)/

/** Which shell a path opens in: admin pages, a page without the menu, or a learner page. */
export function orgShellKind(pathname: string | null): OrgShellKind {
  const path = (pathname || '').replace(/^\/orgs\/[^/]+(?=\/|$)/, '')
  if (/^\/admin(\/|$)/.test(path)) return 'admin'
  if (isFocusedActivityPath(path) || MENULESS.test(path)) return 'focused'
  return 'learner'
}

/** A page's body while it loads: heading, a wide card and a row of cards. */
export function PageContentSkeleton() {
  return (
    <div className="flex flex-col gap-8" data-skeleton="page">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-56 rounded-xl sm:w-72" />
        <Skeleton className="h-4 w-full max-w-md rounded-lg" />
      </div>
      <Skeleton className="h-48 w-full rounded-3xl sm:h-56" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className={index === 2 ? 'hidden lg:block' : undefined}>
            <Skeleton className="h-36 w-full rounded-3xl" />
            <Skeleton className="mt-3 h-4 w-3/4 rounded-lg" />
            <Skeleton className="mt-2 h-3 w-1/2 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** One row in a list while it loads: icon, title and a line under it. */
export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border p-4" data-skeleton="row">
      <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-1/2 rounded-lg" />
        <Skeleton className="mt-2 h-3 w-1/3 rounded-lg" />
      </div>
    </div>
  )
}

function MenuRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex h-11 items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          <Skeleton className="h-3.5 rounded-lg" style={{ width: `${56 + ((index * 23) % 40)}px` }} />
        </div>
      ))}
    </>
  )
}

/** The learner side: the side menu on wide screens, the bottom bar on phones, and the page. */
function LearnerShell() {
  return (
    <>
      <div className="mx-auto w-full md:flex md:items-start md:px-6">
        <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col px-4 py-6 md:flex" data-skeleton="menu">
          <div className="flex h-10 items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-2xl" />
            <Skeleton className="h-4 w-28 rounded-lg" />
          </div>
          <div className="mt-6 flex flex-1 flex-col justify-center gap-1"><MenuRows count={6} /></div>
          <div className="mt-auto flex flex-col gap-1 pt-6"><MenuRows count={2} /></div>
        </aside>
        <div className="w-full min-w-0 px-4 pb-24 pt-6 md:w-[66rem] md:max-w-full md:px-8 md:pb-10 md:pt-10">
          <PageContentSkeleton />
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 flex justify-center bg-shell px-2 md:hidden" data-skeleton="bottom-bar">
        <div className="flex h-16 w-full max-w-screen-sm items-center justify-around gap-1">
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-8 w-8 rounded-xl" />)}
        </div>
      </div>
    </>
  )
}

/** Admin: the left menu on wide screens, a top bar on phones, and the page. */
function AdminShell() {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="hidden h-dvh w-64 shrink-0 flex-col gap-1 border-r border-border px-4 py-6 md:flex" data-skeleton="menu">
        <div className="mb-6 flex h-10 items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-2xl" />
          <Skeleton className="h-4 w-28 rounded-lg" />
        </div>
        <MenuRows count={7} />
      </aside>
      <div className="flex h-14 items-center justify-between border-b border-border px-4 md:hidden">
        <Skeleton className="h-8 w-8 rounded-xl" />
        <Skeleton className="h-4 w-28 rounded-lg" />
        <Skeleton className="h-8 w-8 rounded-xl" />
      </div>
      <div className="w-full min-w-0 px-4 py-6 md:px-10 md:py-10">
        <PageContentSkeleton />
      </div>
    </div>
  )
}

export function OrgShellSkeleton({ pathname }: { pathname: string | null }) {
  const kind = orgShellKind(pathname)
  return (
    <div
      className="min-h-dvh w-full"
      style={{ backgroundColor: 'var(--org-page-background, hsl(var(--background)))' }}
      role="status"
      aria-label="Loading"
      aria-busy="true"
      data-org-loading={kind}
    >
      {kind === 'admin' ? <AdminShell /> : kind === 'focused' ? (
        <div className="mx-auto w-full max-w-3xl px-4 py-10"><PageContentSkeleton /></div>
      ) : <LearnerShell />}
    </div>
  )
}

export default OrgShellSkeleton
