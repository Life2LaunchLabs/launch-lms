'use client'

import React from 'react'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'
import { EnvelopeSimple, GoogleLogo, Key, SignIn } from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { signIn } from '@components/Contexts/AuthContext'
import { settingsCard, SettingsHeader } from '@components/Objects/Account/AccountPageShell'
import { Button } from '@components/ui/button'
import { accountSettingsApi, signInMethodsKey, type SignInMethods } from '@services/users/accountEmails'
import { ChangePasswordForm } from './ChangePasswordForm'
import { tr } from '@/lib/tr'

function Row({ icon: Icon, title, detail, children }: { icon: React.ElementType; title: string; detail: React.ReactNode; children?: React.ReactNode }) {
  return <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon size={18} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[15px] font-bold">{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
    {children}
  </li>
}

/**
 * Settings › Sign-in methods (PF-3, DEV-222): email (how many verified, with Manage), password (Change password) and
 * Google (Connect or Disconnect). Passkeys and Apple wait for v0.12.0.
 */
export default function AccountSignInMethods() {
  useTranslation()
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token as string | undefined
  const { data, mutate } = useSWR<SignInMethods>(token ? signInMethodsKey() : null, () => accountSettingsApi.signInMethods(token as string))
  const [changing, setChanging] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  if (!data || !token) return null

  const manage = () => document.getElementById('account-emails')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const connect = async () => {
    setBusy(true); setError('')
    const result = await signIn('google', { linkGoogle: true, callbackUrl: `${window.location.pathname}#sign-in` })
    if (result && !result.ok) { setError(result.error || tr('account_settings.try_again', 'That didn’t work. Try again.')); setBusy(false) }
  }
  const disconnect = async () => {
    setBusy(true); setError('')
    try { await mutate(await accountSettingsApi.disconnectGoogle(token), { revalidate: false }) }
    catch (caught: any) { setError(caught?.message || tr('account_settings.try_again', 'That didn’t work. Try again.')) }
    finally { setBusy(false) }
  }

  const verified = data.email.verified
  return <section id="sign-in" className={`${settingsCard} scroll-mt-6 p-5 sm:p-6`} aria-label={tr('account_settings.sign_in_methods', 'Sign-in methods')} data-testid="settings-sign-in">
    <SettingsHeader icon={SignIn} title={tr('account_settings.sign_in_methods', 'Sign-in methods')} description={tr('account_settings.sign_in_description', 'The ways you can sign in to your account.')} />
    <ul className="mt-2 max-w-2xl divide-y divide-border">
      <Row icon={EnvelopeSimple} title={tr('account_settings.email', 'Email')}
        detail={verified === 1 ? tr('account_settings.one_verified', '1 verified email') : tr('account_settings.n_verified', '{{count}} verified emails', { count: verified })}>
        <Button type="button" variant="surface" size="sm" onClick={manage}>{tr('account_settings.manage', 'Manage')}</Button>
      </Row>
      <li className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <Key size={18} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[15px] font-bold">{tr('account_settings.password', 'Password')}</p>
              <p className="text-sm text-muted-foreground">{data.password.set ? tr('account_settings.password_set', 'Set') : tr('account_settings.no_password', 'No password yet. Use Forgot password on the sign-in page to set one.')}</p>
            </div>
          </div>
          {data.password.set && !changing ? <Button type="button" variant="surface" size="sm" onClick={() => setChanging(true)}>{tr('account_settings.change_password', 'Change password')}</Button> : null}
        </div>
        {changing ? <div className="mt-4"><ChangePasswordForm onCancel={() => setChanging(false)} /></div> : null}
      </li>
      {data.google.available || data.google.connected ? <Row icon={GoogleLogo} title="Google"
        detail={data.google.connected ? (data.google.email ? tr('account_settings.google_connected_as', 'Connected as {{email}}', { email: data.google.email }) : tr('account_settings.google_connected', 'Connected')) : tr('account_settings.google_not_connected', 'Not connected')}>
        {data.google.connected
          ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void disconnect()}>{tr('account_settings.disconnect', 'Disconnect')}</Button>
          : <Button type="button" variant="surface" size="sm" disabled={busy || !data.google.available} onClick={() => void connect()}>{tr('account_settings.connect', 'Connect')}</Button>}
      </Row> : null}
    </ul>
    {error ? <p role="alert" className="mt-2 max-w-2xl text-sm font-semibold text-red-600 dark:text-red-400">{error}</p> : null}
  </section>
}
