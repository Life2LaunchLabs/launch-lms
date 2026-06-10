import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/ssr'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { planAreas } from './planAreas'

type PageParams = Promise<{
  orgslug: string
}>

export default async function PlanPage({ params }: { params: PageParams }) {
  const { orgslug } = await params

  return (
    <GeneralWrapperStyled>
      <main className="mx-auto w-full max-w-4xl">
        <header className="mx-auto mb-10 max-w-2xl text-center md:mb-12">
          <h1 className="text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">
            Launch Plan
          </h1>
          <p className="mt-3 text-base text-gray-500 sm:text-lg">
            Build your launch plan in the 4 areas of life launching!
          </p>
        </header>

        <div className="flex flex-col gap-4">
          {planAreas.map((area) => {
            const Icon = area.icon

            return (
              <Link
                key={area.slug}
                href={getUriWithOrg(orgslug, routePaths.org.planArea(area.slug))}
                className="group flex items-center gap-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 sm:gap-6 sm:p-6"
              >
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gray-50 text-gray-800 sm:h-20 sm:w-20">
                  <Icon size={38} weight="duotone" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold text-gray-950 sm:text-2xl">
                    {area.title}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-gray-500 sm:text-base">
                    {area.description}
                  </p>
                </div>
                <ArrowRight
                  size={22}
                  weight="bold"
                  className="hidden shrink-0 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-gray-600 sm:block"
                />
              </Link>
            )
          })}
        </div>
      </main>
    </GeneralWrapperStyled>
  )
}
