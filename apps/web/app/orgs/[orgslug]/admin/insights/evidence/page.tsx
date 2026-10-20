import { InsightsEvidencePage } from '@components/Goals/admin/insights/InsightsPages'

export default async function InsightsEvidence({ params, searchParams }: { params: Promise<{ orgslug: string }>; searchParams: Promise<{ group?: string }> }) {
  const [{ orgslug }, { group }] = await Promise.all([params, searchParams])
  const groupId = Number(group)
  return <InsightsEvidencePage orgslug={orgslug} groupId={Number.isInteger(groupId) && groupId > 0 ? groupId : null} />
}
