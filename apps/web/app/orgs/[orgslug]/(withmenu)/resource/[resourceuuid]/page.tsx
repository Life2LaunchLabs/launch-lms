import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

export default async function ResourceDetailPage(props: { params: Promise<{ resourceuuid: string }> }) {
  const { resourceuuid } = await props.params
  redirect(routePaths.org.resource(resourceuuid))
}
