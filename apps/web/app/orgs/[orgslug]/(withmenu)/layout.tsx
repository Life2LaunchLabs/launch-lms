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
import HubShell from '@components/Hub/HubShell'
import { useHub } from '@components/Hub/HubContext'
import ExperiencePreferenceTracker from '@components/Auth/ExperiencePreferenceTracker'
import CandidateExperience from '@components/Candidate/CandidateExperience'
import OperationsSurface from '@components/Operations/OperationsSurface'
import { isFocusedActivityPath } from '@services/routing/learnerExperience'

function OrgFooter() {
  const org = useOrg() as any
  const footerText = org?.config?.config?.customization?.general?.footer_text || org?.config?.config?.general?.footer_text || ''

  if (!footerText) return null

  return (
    <footer className="w-full py-8 mt-12 print:hidden">
      <div className="flex flex-col items-center justify-center space-y-4">
        <p className="text-sm text-muted-foreground">{footerText}</p>
      </div>
    </footer>
  )
}

function LayoutContent({ children, orgslug }: { children: React.ReactNode; orgslug: string }) {
  const session = useLHSession() as any
  const pathname = usePathname()
  const hub = useHub()
  const isLandingPage = session?.status === 'unauthenticated' && pathname === '/'

  const pathParts = pathname?.split('/').filter(Boolean) || []

  // Pages that use a full-bleed layout (no footer)
  const noFooterPaths = ['copilot']
  const isFullBleedPage = noFooterPaths.some((p) => pathParts.includes(p))
  const isActivityPage = isFocusedActivityPath(pathname)
  const isCoursePage = /^\/course\/[^/]+$/.test(pathname || '')
  const isPublicCourseExperience = isCoursePage || isActivityPage
  const showGuestHeader = session?.status === 'unauthenticated' && !isPublicCourseExperience
  const showOrgMenu = session?.status !== 'unauthenticated' && !isActivityPage

  if (isActivityPage) return <div className="min-h-dvh w-full" data-focused-activity><PageViewTracker />{children}</div>

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
      className="org-layout-shell flex flex-col min-h-screen print:min-h-0"
      style={{ backgroundColor: 'var(--org-page-background)' }}
    >
      <PageViewTracker />
      {session?.status === 'authenticated' ? <ExperiencePreferenceTracker side="user" orgslug={orgslug} /> : null}
      <OrgJoinBanner />
      {showGuestHeader && (
        <div className="print:hidden">
          <GuestHeader orgslug={orgslug} />
        </div>
      )}
      <div className="org-page-body scrollbar-subtle scrollbar-subtle-rounded flex-1 min-h-0 relative print:flex-none" style={{ zIndex: 'var(--z-content)' }}>
        <div className={`org-page-layout mx-auto w-full md:flex md:items-start print:block print:px-0 ${isActivityPage ? 'md:w-full md:px-0' : 'md:px-6'}`}>
          {showOrgMenu && (
            <div className="print:hidden md:contents">
              <OrgMenu orgslug={orgslug} compact={hub?.state === 'open'} />
            </div>
          )}
          <div className={`org-page-content learner-page min-w-0 w-full pb-[calc(5rem+env(safe-area-inset-bottom))] md:max-w-full md:shrink md:pb-0 print:pb-0 ${isActivityPage ? 'md:w-full' : 'md:w-[66rem]'}`}>
            <div className="learner-page-inner">{children}</div>
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
  const session = useLHSession() as any
  const org = useOrg() as any
  const focused = isFocusedActivityPath(usePathname())

  const {
    children
  } = props;

  return (
    <>
      <OrgJoinBannerProvider>
        <PodcastPlayerProvider>
          {!focused ? <><OperationsSurface /><CandidateExperience /></> : null}
          {session?.status === 'authenticated' ? <HubShell key={`${org?.id}:${session?.data?.user?.id}`} orgslug={params?.orgslug} orgId={org?.id} focused={focused}>
            <LayoutContent orgslug={params?.orgslug}>{children}</LayoutContent>
          </HubShell> : <LayoutContent orgslug={params?.orgslug}>{children}</LayoutContent>}
          {!focused ? <PodcastPlayer /> : null}
        </PodcastPlayerProvider>
      </OrgJoinBannerProvider>
    </>
  )
}
