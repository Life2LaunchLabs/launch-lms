import Link from 'next/link'
import { ArrowLeft } from '@phosphor-icons/react/ssr'
import { notFound } from 'next/navigation'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getPlanArea, planAreas } from '../planAreas'

type PageParams = Promise<{
  orgslug: string
  area: string
}>

export function generateStaticParams() {
  return planAreas.map((area) => ({ area: area.slug }))
}

export default async function PlanAreaPage({ params }: { params: PageParams }) {
  const { orgslug, area: areaSlug } = await params
  const area = getPlanArea(areaSlug)

  if (!area) {
    notFound()
  }

  const Icon = area.icon

  return (
    <GeneralWrapperStyled>
      <main className="mx-auto w-full max-w-6xl">
        <header className="relative mx-auto mb-10 max-w-2xl text-center md:mb-12">
          <Link
            href={getUriWithOrg(orgslug, routePaths.org.plan())}
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-950"
          >
            <ArrowLeft size={16} weight="bold" />
            Launch Plan
          </Link>
          <div className="flex justify-center">
            <Icon size={40} weight="duotone" className="text-gray-700" />
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">
            {area.title}
          </h1>
          <p className="mt-3 text-base text-gray-500 sm:text-lg">{area.description}</p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          {[
            'md:col-span-2',
            'md:col-span-2',
            'md:col-span-2',
            'md:col-span-3',
            'md:col-span-3',
          ].map((columnSpanClass, index) => (
            <section
              key={index}
              aria-label={`${area.title} canvas section ${index + 1}`}
              className={`min-h-56 rounded-2xl border border-gray-200 bg-white shadow-sm ${columnSpanClass}`}
            />
          ))}
        </div>
      </main>
    </GeneralWrapperStyled>
  )
}
