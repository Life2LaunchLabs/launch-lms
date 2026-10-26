'use client'
import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { CheckCircle, Loader2, Mail } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { joinRequestsApi } from '@services/organizations/joinRequests'

const field = 'h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-[15px] text-gray-950 outline-none placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-100'

/** An invite-only organization's way in without an invitation: ask, and its staff answer by email. */
export default function AskToJoin({ org }: { org: { id: number; name: string } }) {
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const signedIn = session?.status === 'authenticated' && Boolean(token)
  const { data: mine, mutate } = useSWR(signedIn && org?.id ? ['my-join-request', org.id] : null, () => joinRequestsApi.mine(org.id, token as string))
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [sentTo, setSentTo] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  const ask = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await joinRequestsApi.ask(org.id, signedIn ? { message } : { name, email, message }, token)
      setSentTo(signedIn ? session.data.user.email : email)
      await mutate()
    } catch (problem: any) {
      setError(problem?.message || 'That didn’t send. Try again.')
    } finally {
      setBusy(false)
    }
  }
  const withdraw = async () => {
    setBusy(true)
    try {
      await joinRequestsApi.withdraw(org.id, token as string)
      setSentTo('')
      await mutate()
    } finally {
      setBusy(false)
    }
  }

  if (sentTo || mine?.status === 'requested') return <div className="mt-8 rounded-2xl bg-gray-50 px-5 py-5 text-left ring-1 ring-gray-100">
    <p className="flex items-center gap-2 font-semibold text-gray-900"><CheckCircle size={18} className="text-green-600" />Request sent</p>
    <p className="mt-1.5 text-sm leading-6 text-gray-600">{org.name} will email you{sentTo ? ` at ${sentTo}` : ''} when they answer.</p>
    {signedIn ? <button type="button" disabled={busy} onClick={withdraw} className="mt-3 text-sm font-semibold text-gray-700 underline disabled:opacity-50">Withdraw my request</button> : null}
  </div>

  return <form onSubmit={ask} className="mt-8 space-y-3 text-left">
    <p className="text-sm font-semibold text-gray-900">Or ask to join</p>
    {signedIn ? null : <>
      <input className={field} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" required />
      <input className={field} value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email address" autoComplete="email" required />
    </>}
    <textarea className={`${field} h-24 resize-none py-2.5`} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} placeholder={`Anything ${org.name} should know (optional)`} />
    {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
    <button type="submit" disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-black font-semibold text-white hover:bg-gray-800 disabled:opacity-50">
      {busy ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}Ask to join
    </button>
    {signedIn ? null : <p className="text-center text-sm text-gray-500">Already have an account? <Link href="/login" className="font-semibold text-gray-900">Log in</Link> to ask with it.</p>}
  </form>
}
