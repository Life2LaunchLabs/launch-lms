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
  const session = useLHSession() as any
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
        style={{ backgroundColor: 'var(--org-page-background)' }}
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
      style={{ backgroundColor: 'var(--org-page-background)' }}
    >
      <PageViewTracker />
      <OrgJoinBanner />
      {showGuestHeader && (
        <div className="print:hidden">
          <GuestHeader orgslug={orgslug} />
        </div>
      )}
      <div className="flex-1 relative print:flex-none" style={{ zIndex: 'var(--z-content)' }}>
        <div className="mx-auto w-full md:flex md:w-fit md:max-w-full md:items-start md:gap-4 md:px-4 lg:px-5 xl:px-6 2xl:px-8 print:block print:px-0">
          {showOrgMenu && (
            <div className="print:hidden md:contents">
              <OrgMenu orgslug={orgslug} />
            </div>
          )}
          <div className="min-w-0 w-full pb-28 md:w-[66rem] md:max-w-full md:shrink md:pb-0 print:pb-0">
            {children}
          </div>
          <div
            id="org-layout-right-sidebar"
            className="hidden w-[280px] shrink-0 self-stretch pt-6 empty:hidden lg:block print:hidden"
          />
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
