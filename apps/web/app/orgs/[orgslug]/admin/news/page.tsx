import { notFound } from 'next/navigation'
import { getCoreCapabilities } from '@services/config/config'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import NewsDashClient from './client'

export default async function NewsDashPage(props: {
  params: Promise<{ orgslug: string }>
}) {
  if (!getCoreCapabilities().news) notFound()
  const { orgslug } = await props.params
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 180,
    tags: ['organizations'],
  })

  return <NewsDashClient orgId={org.id} orgslug={orgslug} />
}
