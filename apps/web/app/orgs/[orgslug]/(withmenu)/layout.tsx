'use client';
import React, { use } from "react";
import '@styles/globals.css'
import { OrgMenu } from '@components/Objects/Menus/OrgMenu'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { OrgJoinBanner, OrgJoinBannerProvider } from '@components/Objects/Banners/OrgJoinBanner'
import { PodcastPlayerProvider } from '@components/Contexts/PodcastPlayerContext'
import dynamic from 'next/dynamic'
const PodcastPlayer = dynamic(() => import('@components/Objects/Podcasts/PodcastPlayer'), { ssr: false })
import { PageViewTracker } from '@components/Analytics/PageViewTracker'
import { usePathname } from 'next/navigation'
import { GuestHeader } from '@components/Objects/Menus/GuestHeader'

const hexToTintedWhite = (hex: string, amount: number): string => {
  if (!hex || hex.length < 7) return '#ffffff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mix = (channel: number) => Math.round(255 - (255 - channel) * amount)
  return `rgb(${mix(r)} ${mix(g)} ${mix(b)})`
}

function OrgFooter() {
  const org = useOrg() as any
  const footerText = org?.config?.config?.customization?.general?.footer_text || org?.config?.config?.general?.footer_text || ''

  if (!footerText) return null

  return (
    <footer className="w-full py-8 mt-12 print:hidden">
      <div className="flex flex-col items-center justify-center space-y-4">
        <p className="text-sm text-gray-500">{footerText}</p>
      </div>
    </footer>
  )
}

function LayoutContent({ children, orgslug }: { children: React.ReactNode; orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const primaryColor = org?.config?.config?.customization?.general?.color || org?.config?.config?.general?.color || ''
  const orgPrimaryColor = primaryColor || '#8b5cf6'
  const pageBackgroundColor = primaryColor ? hexToTintedWhite(primaryColor, 0.05) : '#ffffff'
  const pathname = usePathname()
  const isLandingPage = session?.status === 'unauthenticated' && pathname === '/'

  const pathParts = pathname?.split('/').filter(Boolean) || []

  // Pages that use a full-bleed layout (no footer)
  const noFooterPaths = ['copilot']
  const isFullBleedPage = noFooterPaths.some((p) => pathParts.includes(p))
  const isActivityPage = pathname?.includes('/activity/')
  const isCoursePage = /^\/course\/[^/]+$/.test(pathname || '')
  const isPublicCourseExperience = isCoursePage || isActivityPage
  const showGuestHeader = session?.status === 'unauthenticated' && !isPublicCourseExperience
  const showOrgMenu = session?.status !== 'unauthenticated'

  if (isLandingPage) {
    return (
      <div
        className="min-h-screen"
        style={{
          '--org-page-background': pageBackgroundColor,
          '--org-primary-color': orgPrimaryColor,
        } as React.CSSProperties}
      >
        <PageViewTracker />
        <OrgJoinBanner />
        <div className="sticky top-0 print:hidden" style={{ zIndex: 'var(--z-nav)' }}>
          <GuestHeader orgslug={orgslug} />
        </div>
        {children}
      </div>
    )
  }

  return (
    <div
      className="flex flex-col min-h-screen print:min-h-0"
      style={{
        backgroundColor: pageBackgroundColor,
        '--org-page-background': pageBackgroundColor,
        '--org-primary-color': orgPrimaryColor,
      } as React.CSSProperties}
    >
      <PageViewTracker />
      <OrgJoinBanner />
      {showGuestHeader && (
        <div className="print:hidden">
          <GuestHeader orgslug={orgslug} />
        </div>
      )}
      <div className="flex-1 relative print:flex-none" style={{ zIndex: 'var(--z-content)' }}>
        <div className="w-full md:flex md:items-start md:px-4 lg:px-5 xl:px-6 2xl:px-8 print:block print:px-0">
          {showOrgMenu && (
            <div className="print:hidden md:contents">
              <OrgMenu orgslug={orgslug} />
            </div>
          )}
          <div className="flex-1 min-w-0 pb-28 md:pb-0 print:pb-0">
            {children}
          </div>
        </div>
      </div>
      {!isFullBleedPage && <OrgFooter />}
    </div>
  )
}

export default function RootLayout(
  props: {
    children: React.ReactNode
    params: Promise<any>
  }
) {
  const params = use(props.params);

  const {
    children
  } = props;

  return (
    <>
      <OrgJoinBannerProvider>
        <PodcastPlayerProvider>
          <LayoutContent orgslug={params?.orgslug}>
            {children}
          </LayoutContent>
          <PodcastPlayer />
        </PodcastPlayerProvider>
      </OrgJoinBannerProvider>
    </>
  )
}
