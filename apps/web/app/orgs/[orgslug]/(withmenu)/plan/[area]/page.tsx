import { notFound } from 'next/navigation'
import { getPlanArea, planAreas } from '../planAreas'
import PlanAreaClient from './PlanAreaClient'
import { getServerSession } from '@/lib/auth/server'
import { redirect } from 'next/navigation'

type PageParams = Promise<{
  orgslug: string
  area: string
}>

export function generateStaticParams() {
  return planAreas.map((area) => ({ area: area.slug }))
}

export default async function PlanAreaPage({ params }: { params: PageParams }) {
  const { orgslug, area: areaSlug } = await params
  const session = await getServerSession()
  if (!session?.tokens?.access_token) {
    redirect(`/orgs/${orgslug}/login?redirect=/orgs/${orgslug}/plan/${areaSlug}`)
  }
  const area = getPlanArea(areaSlug)

  if (!area) {
    notFound()
  }

  return (
    <PlanAreaClient
      orgslug={orgslug}
      area={{
        slug: area.slug,
        title: area.title,
        description: area.description,
        status: area.status,
        progress: area.progress,
        theme: area.theme,
      }}
    />
  )
}
