'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import {
  X,
  House,
  Books,
  ChatsCircle,
  Headphones,
  Cube,
  ShoppingBag,
  Certificate,
} from '@phosphor-icons/react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { swrFetcher } from '@services/utils/ts/requests'
import { getMenuColorClasses } from '@services/utils/ts/colorUtils'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'

interface OrgMenuSidebarProps {
  orgslug: string
  isOpen: boolean
  onClose: () => void
}

const KNOWN_SUBPATHS = [
  '/courses', '/course/', '/collection/', '/collections', '/trail', '/certificate', '/podcasts',
  '/communities', '/playgrounds', '/store', '/boards', '/copilot',
  '/activity/', '/assignment', '/editor', '/account', '/payments',
]

export function OrgMenuSidebar({ orgslug, isOpen, onClose }: OrgMenuSidebarProps) {
  const { t } = useTranslation()
  const org = useOrg() as any
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const pathname = usePathname()
  const orgID = org?.id
  const config = org?.config?.config
  const rf = config?.resolved_features
  const primaryColor = config?.customization?.general?.color || config?.general?.color || ''
  const colors = getMenuColorClasses(primaryColor)

  // Close sidebar on route change
  useEffect(() => {
    onClose()
  }, [pathname])

  // Trail data for active courses
  const isCoursesEnabled = rf?.courses?.enabled
  const { data: trail } = useSWR(
    isCoursesEnabled && orgID && access_token ? `${getAPIUrl()}trail/org/${orgID}/trail` : null,
    (url) => swrFetcher(url, access_token),
    { revalidateOnFocus: false }
  )

  const isEnabled = (feature: string) => rf?.[feature]?.enabled === true

  // Active state helpers
  const isHome = !KNOWN_SUBPATHS.some(p => pathname?.includes(p))
  const isOnCourses = pathname?.includes('/courses') || pathname?.includes('/course/') || pathname?.includes('/collection/')
  const isOnPodcasts = pathname?.includes('/podcasts')
  const isOnCommunities = pathname?.includes('/communities')
  const isOnPlaygrounds = pathname?.includes('/playgrounds')
  const isOnStore = pathname?.includes('/store')
  const isOnTrail = pathname?.includes('/trail') || pathname?.includes('/certificate')

  const navItems = [
    {
      href: '/',
      label: t('common.home') || 'Home',
      icon: <House size={18} weight="fill" />,
      active: isHome,
      show: true,
    },
    {
      href: '/courses',
      label: t('courses.courses'),
      icon: <Books size={18} weight="fill" />,
      active: isOnCourses,
      show: isEnabled('courses'),
    },
    {
      href: '/podcasts',
      label: t('podcasts.podcasts'),
      icon: <Headphones size={18} weight="fill" />,
      active: isOnPodcasts,
      show: isEnabled('podcasts'),
    },
    {
      href: '/communities',
      label: t('communities.title'),
      icon: <ChatsCircle size={18} weight="fill" />,
      active: isOnCommunities,
      show: isEnabled('communities'),
    },
    {
      href: '/playgrounds',
      label: 'Playgrounds',
      icon: <Cube size={18} weight="fill" />,
      active: isOnPlaygrounds,
      show: isEnabled('playgrounds'),
    },
    {
      href: '/store',
      label: 'Store',
      icon: <ShoppingBag size={18} weight="fill" />,
      active: isOnStore,
      show: isEnabled('payments'),
    },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ zIndex: 51, backgroundColor: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <div
        className={`fixed top-0 left-0 bottom-0 w-80 bg-white rounded-r-2xl shadow-2xl flex flex-col transition-transform duration-300 ease-in-out overflow-hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ zIndex: 52 }}
        aria-label="Navigation menu"
      >
        {/* Header — matches nav bar height and color */}
        <div
          className={`h-[60px] flex items-center justify-between px-5 shrink-0 ${!primaryColor ? 'bg-white/90 border-b border-black/5' : ''}`}
          style={{ backgroundColor: primaryColor || undefined }}
        >
          <Link href={getUriWithOrg(orgslug, '/')} onClick={onClose} className="flex items-center">
            {org?.logo_image ? (
              <img
                src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)}
                alt="Logo"
                className="h-8 w-auto rounded-md"
              />
            ) : (
              <Image
                src="/lrn-text.svg"
                alt="Launch LMS"
                width={110}
                height={33}
                style={{ height: '30px', width: 'auto', filter: colors.logoFilter }}
              />
            )}
          </Link>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${colors.iconBtn}`}
            aria-label="Close menu"
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        {/* Scrollable content — white below the header when primary color is set */}
        <div
          className="flex-1 overflow-y-auto bg-white"
        >
          {/* Nav links */}
          <nav className="px-3 py-3 flex flex-col gap-0.5">
            {navItems.filter(item => item.show).map((item) => (
              <Link
                key={item.href}
                href={getUriWithOrg(orgslug, item.href)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  item.active
                    ? 'bg-gray-100 text-gray-900 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-medium'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}

            {session?.status === 'authenticated' && (
              <Link
                href={getUriWithOrg(orgslug, '/certificate')}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isOnTrail
                    ? 'bg-gray-100 text-gray-900 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-medium'
                }`}
              >
                <Certificate size={18} weight="fill" />
                <span>Certificates</span>
              </Link>
            )}
          </nav>

          {/* Divider */}
          <hr className="mx-4 border-gray-100" />

          {/* Active courses */}
          {session?.status === 'authenticated' && trail?.runs?.length > 0 && (
            <div className="px-3 py-3">
              <p className="px-3 text-[11px] text-gray-400 font-semibold uppercase tracking-wider mb-2">
                Active Courses
              </p>
              <div className="flex flex-col gap-0.5">
                {trail.runs.map((run: any) => {
                  const courseId = run.course.course_uuid.replace('course_', '')
                  const isActiveCourse = pathname?.includes(`/course/${courseId}`)
                  const progress = run.course_total_steps > 0
                    ? Math.round((run.steps.length / run.course_total_steps) * 100)
                    : 0
                  return (
                    <div key={run.course.course_uuid} className="relative">
                      {isActiveCourse && (
                        <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-gray-400 rounded-r-full" />
                      )}
                      <Link
                        href={getUriWithOrg(orgslug, `/course/${courseId}`)}
                        className={`flex flex-col px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActiveCourse
                            ? 'bg-gray-100 text-gray-900'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <span className={`truncate leading-snug ${isActiveCourse ? 'font-semibold' : 'font-medium'}`}>
                          {run.course.name}
                        </span>
                        <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gray-400 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </Link>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
