import Link from 'next/link'
import { Lock, Sparkle } from '@phosphor-icons/react/ssr'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { planAreas } from './planAreas'
import { getServerSession } from '@/lib/auth/server'
import { redirect } from 'next/navigation'

type PageParams = Promise<{ orgslug: string }>

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  'in-progress': 'In Progress',
  locked: 'Locked',
}

const activeCount = planAreas.filter((a) => a.status !== 'locked').length
const totalCount = planAreas.length
const overallPercent = Math.round((activeCount / totalCount) * 100)

const RADIUS = 38
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const DASH = (overallPercent / 100) * CIRCUMFERENCE

export default async function PlanPage({ params }: { params: PageParams }) {
  const { orgslug } = await params
  const session = await getServerSession()
  if (!session?.tokens?.access_token) {
    redirect(`/orgs/${orgslug}/login?redirect=/orgs/${orgslug}/plan`)
  }

  return (
    <GeneralWrapperStyled>
      <main className="mx-auto w-full max-w-4xl">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">
              Your Launch Plan
            </h1>
            <p className="mt-1.5 text-base text-gray-500">
              Mapping out the best version of you, one quest at a time.
            </p>
          </div>

          {/* Overall progress ring */}
          <div className="flex w-fit shrink-0 items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <svg width="60" height="60" viewBox="0 0 100 100" aria-hidden="true">
              <circle
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="12"
              />
              <circle
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                stroke="#6366f1"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${DASH} ${CIRCUMFERENCE}`}
                transform="rotate(-90 50 50)"
              />
              <text
                x="50"
                y="50"
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="24"
                fontWeight="800"
                fill="#111827"
              >
                {overallPercent}%
              </text>
            </svg>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Overall Progress
              </p>
              <p className="mt-0.5 text-sm font-bold text-gray-900">
                {activeCount}/{totalCount} Modules Active
              </p>
            </div>
          </div>
        </header>

        {/* 2-col grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {planAreas.map((area) => {
            const Icon = area.icon
            const isLocked = area.status === 'locked'

            const cardInner = (
              <>
                {/* Icon + badge row */}
                <div className="flex items-start justify-between">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl ${area.theme.iconBg}`}
                  >
                    <Icon
                      size={30}
                      weight="duotone"
                      className={area.theme.iconColor}
                    />
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${area.theme.badgeBg} ${area.theme.badgeColor}`}
                  >
                    {STATUS_LABEL[area.status]}
                  </span>
                </div>

                {/* Title + description */}
                <div className="mt-4">
                  <h2 className="text-lg font-black text-gray-950">
                    {area.title}
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-gray-500">
                    {area.description}
                  </p>
                </div>

                {/* Progress bar */}
                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      className={`text-xs font-bold ${isLocked ? 'text-gray-400' : 'text-gray-600'}`}
                    >
                      {area.progress}% Complete
                    </span>
                    {isLocked ? (
                      <Lock size={13} className="text-gray-400" />
                    ) : area.status === 'active' ? (
                      <Sparkle
                        size={13}
                        weight="fill"
                        className={area.theme.iconColor}
                      />
                    ) : null}
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${isLocked ? 'bg-gray-200' : area.theme.barColor}`}
                      style={{ width: `${area.progress}%` }}
                    />
                  </div>
                </div>
              </>
            )

            if (isLocked) {
              return (
                <div
                  key={area.slug}
                  className="rounded-3xl border border-gray-200 bg-white p-5 opacity-60"
                >
                  {cardInner}
                </div>
              )
            }

            return (
              <Link
                key={area.slug}
                href={getUriWithOrg(orgslug, routePaths.org.planArea(area.slug))}
                className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {cardInner}
              </Link>
            )
          })}
        </div>
      </main>
    </GeneralWrapperStyled>
  )
}
