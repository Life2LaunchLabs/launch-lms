'use client'
import Link from 'next/link'
import type { ReactNode } from 'react'
import useSWR from 'swr'
import { OrgContext } from '@components/Contexts/OrgContext'
import { GuestHeader } from '@components/Objects/Menus/GuestHeader'
import { getAPIUrl } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import LegalFooter from './LegalFooter'
import { LEGAL_LINKS } from './legalLinks'

/**
 * The frame of every public policy page (Privacy Policy, Terms of Use, Student data with its Coach retention
 * schedule): the same signed-out header, page colour and footer as the front page (DEV-140), so a reviewer
 * who opens one from sign-up or the front page stays in the same site and can sign in or go back from it.
 *
 * The pages live at the root of every address, outside an organization's pages, so the header gets the
 * address's organization (`orgslug`, from the host) here: its logo shows when it has one, else Life2Launch's.
 * Until it loads, or if it can't, the header shows Life2Launch's logo and links on the same address.
 */
export default function LegalShell({ orgslug, current, children }: { orgslug: string | null; current: string; children: ReactNode }) {
  const { data: org } = useSWR(orgslug ? `${getAPIUrl()}orgs/slug/${orgslug}` : null, (url: string) => swrFetcher(url), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  return (
    <div className="min-h-screen text-foreground" style={{ backgroundColor: 'var(--org-page-background)' }}>
      <div className="sticky top-[var(--test-persona-bar-h,0px)] print:hidden" style={{ zIndex: 'var(--z-nav)' }}>
        <OrgContext.Provider value={{ org: org ?? null, isUserPartOfTheOrg: true, orgslug: orgslug || '' }}>
          <GuestHeader orgslug={org?.slug || ''} />
        </OrgContext.Provider>
      </div>
      <div className="bg-card">
        <div className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
          <nav aria-label="Policies" className="-mx-1 flex flex-wrap gap-1 print:hidden">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href} aria-current={link.href === current ? 'page' : undefined}
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:bg-muted aria-[current=page]:text-foreground">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="pt-6 sm:pt-8">{children}</div>
        </div>
      </div>
      <LegalFooter />
    </div>
  )
}
