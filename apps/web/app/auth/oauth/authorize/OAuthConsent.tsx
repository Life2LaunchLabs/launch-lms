'use client'

import React from 'react'
import { useSearchParams } from 'next/navigation'
import { Building2, Check, Loader2, ShieldCheck } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Card } from '@components/ui/card'
import {
  decideOAuthAuthorization,
  type OAuthAuthorizationParams,
  validateOAuthAuthorization,
} from '@services/oauth/oauth'

type Consent = {
  client: { name: string; client_uri?: string | null; redirect_host: string }
  scopes: Array<{ name: string; description: string }>
  orgs: Array<{ id: number; slug: string; name: string }>
  user: { username: string; email: string }
}

export default function OAuthConsent() {
  const searchParams = useSearchParams()
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [consent, setConsent] = React.useState<Consent | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [orgId, setOrgId] = React.useState<number | null>(null)
  const [submitting, setSubmitting] = React.useState<'approve' | 'deny' | null>(null)

  const params = React.useMemo<OAuthAuthorizationParams>(() => ({
    client_id: searchParams.get('client_id') || '',
    redirect_uri: searchParams.get('redirect_uri') || '',
    code_challenge: searchParams.get('code_challenge') || '',
    code_challenge_method: searchParams.get('code_challenge_method') || 'S256',
    response_type: searchParams.get('response_type') || 'code',
    scope: searchParams.get('scope'),
    state: searchParams.get('state'),
    resource: searchParams.get('resource'),
  }), [searchParams])

  React.useEffect(() => {
    if (session?.status === 'unauthenticated') {
      window.location.replace(`/login?next=${encodeURIComponent(window.location.href)}`)
      return
    }
    if (session?.status !== 'authenticated') return
    validateOAuthAuthorization(params, accessToken)
      .then((result: Consent) => {
        setConsent(result)
        if (result.orgs.length === 1) setOrgId(result.orgs[0].id)
      })
      .catch((reason: any) => setError(reason?.message || 'This connection request is not valid.'))
  }, [params, accessToken, session?.status])

  const decide = async (approve: boolean) => {
    setSubmitting(approve ? 'approve' : 'deny')
    try {
      const { redirect_to } = await decideOAuthAuthorization({ ...params, approve, org_id: orgId }, accessToken)
      window.location.assign(redirect_to)
    } catch (reason: any) {
      setError(reason?.message || 'Could not complete the connection.')
      setSubmitting(null)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted px-4 py-10">
      <Card className="w-full max-w-md" size="sm">
        {error ? (
          <div role="alert">
            <h1 className="text-xl font-black">Can’t connect this app</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : !consent ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking the request…</div>
        ) : (
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-background">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h1 className="mt-4 text-2xl font-black leading-tight">Connect {consent.client.name} to Launch LMS</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as <span className="font-semibold text-foreground">{consent.user.email}</span>
            </p>

            <fieldset className="mt-6">
              <legend className="text-xs font-black uppercase tracking-wide text-muted-foreground">Organization</legend>
              {consent.orgs.length ? (
                <div className="mt-2 space-y-2">
                  {consent.orgs.map((org) => (
                    <label key={org.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 transition ${orgId === org.id ? 'border-foreground bg-card' : 'border-border bg-card hover:bg-muted'}`}>
                      <input type="radio" name="org" className="sr-only" checked={orgId === org.id} onChange={() => setOrgId(org.id)} />
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-sm font-bold">{org.name}</span>
                      {orgId === org.id ? <Check className="h-4 w-4" /> : null}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-2xl bg-muted p-3 text-sm text-muted-foreground">You need to be an admin of an organization to connect an app.</p>
              )}
            </fieldset>

            <div className="mt-6">
              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">{consent.client.name} will be able to</p>
              <ul className="mt-2 space-y-2 text-sm">
                {consent.scopes.map((scope) => (
                  <li key={scope.name} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{scope.description}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                It can’t publish badge versions, delete activities, or see learner data. You can disconnect at any time.
                Sends you back to <span className="font-semibold">{consent.client.redirect_host}</span>.
              </p>
            </div>

            <div className="mt-7 flex gap-3">
              <Button variant="surface" className="flex-1" disabled={Boolean(submitting)} onClick={() => decide(false)}>
                {submitting === 'deny' ? <Loader2 className="animate-spin" /> : null} Cancel
              </Button>
              <Button className="flex-1" disabled={Boolean(submitting) || !orgId} onClick={() => decide(true)}>
                {submitting === 'approve' ? <Loader2 className="animate-spin" /> : null} Allow access
              </Button>
            </div>
          </div>
        )}
      </Card>
    </main>
  )
}
