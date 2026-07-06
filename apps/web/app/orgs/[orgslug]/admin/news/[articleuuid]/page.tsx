import { getOrganizationContextInfo } from '@services/organizations/orgs'
import NewsPostForm from '../NewsPostForm'

export default async function EditNewsPostPage(props: {
  params: Promise<{ orgslug: string; articleuuid: string }>
}) {
  const { orgslug, articleuuid } = await props.params
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 180,
    tags: ['organizations'],
  })

  return (
    <NewsPostForm
      orgId={org.id}
      orgslug={orgslug}
      articleUuid={articleuuid}
    />
  )
}
