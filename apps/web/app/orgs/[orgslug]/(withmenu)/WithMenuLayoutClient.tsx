'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useOrg } from '@components/Contexts/OrgContext'
import { OrgMenu } from '@components/Objects/Menus/OrgMenu'
import { OrgJoinBanner, OrgJoinBannerProvider } from '@components/Objects/Banners/OrgJoinBanner'
import { PodcastPlayerProvider } from '@components/Contexts/PodcastPlayerContext'
import { PageViewTracker } from '@components/Analytics/PageViewTracker'

const PodcastPlayer = dynamic(
  () => import('@components/Objects/Podcasts/PodcastPlayer'),
  { ssr: false }
)

const NO_FOOTER_PATHS = ['copilot']

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || hex.length < 7) return 'transparent'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function OrgFooter() {
  const org = useOrg() as any
  const footerText =
    org?.config?.config?.customization?.general?.footer_text ||
    org?.config?.config?.general?.footer_text ||
    ''

  if (!footerText) return null

  return (
    <footer className="w-full py-8 mt-12">
      <div className="flex flex-col items-center justify-center space-y-4">
        <p className="text-sm text-gray-500">{footerText}</p>
      </div>
    </footer>
  )
}

export default function WithMenuLayoutClient({
  children,
  orgslug,
}: {
  children: React.ReactNode
  orgslug: string
}) {
  const org = useOrg() as any
  const primaryColor =
    org?.config?.config?.customization?.general?.color ||
    org?.config?.config?.general?.color ||
    ''
  const pathname = usePathname()
  const pathParts = pathname?.split('/').filter(Boolean) || []
  const isFullBleedPage = NO_FOOTER_PATHS.some((part) => pathParts.includes(part))

  return (
    <OrgJoinBannerProvider>
      <PodcastPlayerProvider>
        <div
          className="flex flex-col min-h-screen"
          style={{
            backgroundColor: primaryColor ? hexToRgba(primaryColor, 0.05) : 'transparent',
          }}
        >
          <PageViewTracker />
          <OrgJoinBanner />
          <div className="flex-1 relative" style={{ zIndex: 'var(--z-content)' }}>
            <div className="w-full md:flex md:items-start md:px-4 lg:px-5 xl:px-6 2xl:px-8">
              <OrgMenu orgslug={orgslug} autoContractDesktopNav={false} />
              <div className="flex-1 min-w-0 pb-28 md:pb-0">{children}</div>
            </div>
          </div>
          {!isFullBleedPage && <OrgFooter />}
        </div>
        <PodcastPlayer />
      </PodcastPlayerProvider>
    </OrgJoinBannerProvider>
  )
}
