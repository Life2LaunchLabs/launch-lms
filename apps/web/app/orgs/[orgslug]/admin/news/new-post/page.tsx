import { notFound } from 'next/navigation'
import { getCoreCapabilities } from '@services/config/config'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import NewsPostForm from '../NewsPostForm'

export default async function NewNewsPostPage(props: {
  params: Promise<{ orgslug: string }>
}) {
  if (!getCoreCapabilities().news) notFound()
  const { orgslug } = await props.params
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 180,
    tags: ['organizations'],
  })

  return <NewsPostForm orgId={org.id} orgslug={orgslug} />
}
