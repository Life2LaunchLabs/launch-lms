'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { PageTitleRegistration } from '@components/Contexts/PageTitleContext'
import { accentVars, isLook, modeOf } from '@components/Looks/looks'
import { formatAppPageTitle } from '@services/routing/pageTitles'
import type { PortfolioLayout } from '@services/portfolio/records'
import { portfolioTitle } from './portfolioTitle'

const ACCENT_KEYS = ['--accent-h', '--accent-s', '--accent-l', '--accent-hex', '--accent-on']

/**
 * Someone else's portfolio, or one of its pages, as a visitor sees it: the whole page (menus and background
 * too) wears its owner's look, accent and light or dark side, and the tab is named after them. Nothing is
 * remembered: the visitor's own look comes back as they leave.
 */
export function VisitorPage({ layout, name, detail }: { layout?: PortfolioLayout | null; name?: string | null; detail?: string }) {
  const { resolvedTheme } = useTheme()
  const raw = layout?.look
  const look = isLook(raw) ? raw : null
  const accent = layout?.accent || null
  const mode = layout ? modeOf(layout) : 'system'
  const section = portfolioTitle(name)

  useEffect(() => {
    const root = document.documentElement
    const before = { look: root.dataset.look, accent: 'accent' in root.dataset, vars: ACCENT_KEYS.map((key) => root.style.getPropertyValue(key)) }
    if (look) root.dataset.look = look; else delete root.dataset.look
    const vars = accentVars(accent)
    for (const key of ACCENT_KEYS) root.style.removeProperty(key)
    for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value)
    if (Object.keys(vars).length) root.dataset.accent = ''; else delete root.dataset.accent
    // A look's light or dark side is the owner's choice; "System" leaves the visitor's own.
    if (look && mode !== 'system') root.classList.toggle('dark', mode === 'dark')
    return () => {
      if (before.look) root.dataset.look = before.look; else delete root.dataset.look
      ACCENT_KEYS.forEach((key, at) => { if (before.vars[at]) root.style.setProperty(key, before.vars[at]); else root.style.removeProperty(key) })
      if (before.accent) root.dataset.accent = ''; else delete root.dataset.accent
      // The visitor's own side: next-themes keeps it as the page's color-scheme, which a look never touches.
      if (root.style.colorScheme) root.classList.toggle('dark', root.style.colorScheme === 'dark')
    }
    // The visitor's theme is read again when it changes, so their side comes back right.
  }, [look, accent, mode, resolvedTheme])

  // Signed-in visitors get the title through the app's page titles; everyone else gets it here.
  useEffect(() => { document.title = formatAppPageTitle({ section, detail }) }, [section, detail])
  return <PageTitleRegistration section={section} detail={detail} />
}
