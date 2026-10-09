import { getAPIUrl } from '@services/config/config'

export async function issueOperationsSession(
  orgId: number,
  nonce: string,
  protocol: string,
  accessToken: string,
): Promise<string> {
  const response = await fetch(`${getAPIUrl()}operations/session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce, protocol, org_id: orgId }),
  })
  if (!response.ok) throw new Error('Operations session unavailable')
  return (await response.json()).token
}
