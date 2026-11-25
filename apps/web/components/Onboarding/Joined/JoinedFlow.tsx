'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, ImageIcon, Loader2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import UserAvatar from '@components/Objects/UserAvatar'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import TourScene from '@components/Onboarding/Start/TourScene'
import AdminSurface from '@components/Utils/AdminSurface'
import '@/styles/admin-dark.css'
import { H1, LEDE, TOUR } from '@components/Onboarding/Start/tour'
import { getUriWithOrg } from '@services/config/config'
import { applyMediaAssetToUserAvatar, type MediaAsset } from '@services/media/library'
import { getUser } from '@services/users/users'
import { updateMyIdentity } from '@services/portfolio/records'

import { tr } from '@/lib/tr'
const INPUT = 'h-11 w-full rounded-xl border border-border bg-white px-3 text-[15px] outline-none transition placeholder:text-muted-foreground/70 focus:border-foreground/40'

/**
 * Where invited staff and admins land after joining: their profile (photo and name), then the /start
 * tour for a new account (`?tour=1`), then Home. They make no setup decisions here; the
 * invitation already set their permissions and assignments.
 */
export default function JoinedFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const userId = session?.data?.user?.id
  const steps = React.useMemo(() => ['profile', ...(searchParams.get('tour') ? [0, 1, 2, 3] : [])] as Array<number | 'profile'>, [searchParams])
  const [index, setIndex] = React.useState(0)
  const [user, setUser] = React.useState<any>(null)
  // Legal name, and the name they go by: learners see it too (PO-3; it replaced "What learners call you").
  const [name, setName] = React.useState({ first_name: '', last_name: '', preferred_name: '' })
  const [picking, setPicking] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const step = steps[index]
  const home = getUriWithOrg(org?.slug, '/admin')

  React.useEffect(() => {
    if (!userId || !token) return
    getUser(userId, token).then((found) => { setUser(found); setName({ first_name: found?.first_name || '', last_name: found?.last_name || '', preferred_name: found?.preferred_name || '' }) }).catch(() => setUser({}))
  }, [userId, token])

  const saveAvatar = async (asset: MediaAsset) => {
    await applyMediaAssetToUserAvatar(asset.asset_uuid, token)
    await session.update?.(true)
  }

  const finish = async () => {
    setError('')
    if (!name.first_name.trim()) return setError(tr('lit.joined_flow.add_your_first_name_so', 'Add your first name so people know who you are.'))
    setBusy(true)
    try {
      if (user?.username && (name.first_name !== user.first_name || name.last_name !== user.last_name || name.preferred_name !== (user.preferred_name || ''))) {
        await updateMyIdentity({ first_name: name.first_name.trim(), last_name: name.last_name.trim(), preferred_name: name.preferred_name.trim() }, token)
        await session.update?.(true)
        setUser({ ...user, ...name })
      }
      setBusy(false)
      if (index < steps.length - 1) setIndex(index + 1)
      else router.push(home)
    } catch (err: any) {
      setError(err?.message || tr('lit.joined_flow.we_couldn_t_save_your_2', 'We couldn’t save your profile'))
      setBusy(false)
    }
  }

  const shown = name.preferred_name.trim() || [name.first_name, name.last_name].filter(Boolean).join(' ') || tr('lit.chat_cards.you', 'You')
  return <div className="flex min-h-screen flex-col bg-[#fbfaf7] text-foreground">
    <AdminSurface />
    <header className="flex min-h-[68px] items-center gap-4 px-6 py-3.5">
      <span className="text-[17px] font-extrabold">{org?.name}</span>
      {typeof step === 'number' ? <button type="button" className="ml-auto text-[13px] font-bold underline underline-offset-4" onClick={() => router.push(home)}>{tr('onboarding.joined_flow.skip_intro', 'Skip intro')}</button> : null}
    </header>
    <main className="mx-auto grid w-full max-w-[1340px] flex-1 grid-cols-1 content-start gap-6 px-5 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:content-center lg:gap-10 lg:pb-6">
      <section className="order-2 flex w-full min-w-0 max-w-[460px] flex-col justify-self-center py-2 lg:order-1 lg:justify-center lg:py-5">
        <AnimatePresence mode="wait">
          <motion.div key={String(step)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
            {typeof step === 'number' ? <>
              <h1 className={H1}>{TOUR[step].title}</h1><p className={LEDE}>{TOUR[step].lede}</p>
              <Nav back={() => setIndex(index - 1)} next={() => index < steps.length - 1 ? setIndex(index + 1) : router.push(home)} label={index < steps.length - 1 ? tr('onboarding.joined_flow.next', 'Next') : tr('onboarding.joined_flow.go_to_home', 'Go to Home')} />
            </> : <>
              <div className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{tr('onboarding.joined_flow.you_re_in', 'You’re in')}</div>
              <h1 className={H1}>{tr('onboarding.joined_flow.how_you_ll_show_up', 'How you’ll show up')}</h1>
              <p className={LEDE}>{tr('onboarding.joined_flow.learners_and_staff_at', 'Learners and staff at')}{' '}{org?.name}{' '}{tr('onboarding.joined_flow.see_this_beside_your_messages', 'see this beside your messages and reviews.')}</p>
              <div className="mt-6 flex items-center gap-4">
                <UserAvatar width={72} rounded="rounded-full" />
                <Button variant="outline" className="rounded-full" onClick={() => setPicking(true)}><ImageIcon />{tr('onboarding.joined_flow.add_a_photo', 'Add a photo')}</Button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="mb-1.5 block text-[13px] font-semibold">{tr('onboarding.joined_flow.first_name', 'First name')}</span><input className={INPUT} value={name.first_name} onChange={(event) => setName({ ...name, first_name: event.target.value })} autoComplete="given-name" /></label>
                <label className="block"><span className="mb-1.5 block text-[13px] font-semibold">{tr('onboarding.joined_flow.last_name', 'Last name')}</span><input className={INPUT} value={name.last_name} onChange={(event) => setName({ ...name, last_name: event.target.value })} autoComplete="family-name" /></label>
              </div>
              <p className="mt-1.5 text-[12px] text-muted-foreground">{tr('onboarding.joined_flow.legal_name_help', 'Your legal name, as on official records. It’s used on records and reports.')}</p>
              <label className="mt-3 block"><span className="mb-1.5 block text-[13px] font-semibold">{tr('portfolio.inline_profile.name_you_go_by', 'Name you go by')}{' '}<span className="font-normal text-muted-foreground">{tr('coach.hub_report_dialog.optional', '(optional)')}</span></span>
                <input className={INPUT} value={name.preferred_name} maxLength={80} placeholder={[name.first_name, name.last_name].filter(Boolean).join(' ') || tr('onboarding.joined_flow.e_g_ms_rivera', 'e.g. Ms. Rivera')} onChange={(event) => setName({ ...name, preferred_name: event.target.value })} autoComplete="nickname" />
                <span className="mt-1 block text-[12px] text-muted-foreground">{tr('onboarding.joined_flow.go_by_help', 'Learners and staff see this instead of your legal name.')}</span></label>
              {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-700 ring-1 ring-red-100">{error}</p> : null}
              <Nav next={() => void finish()} label={steps.length > 1 ? tr('onboarding.joined_flow.continue', 'Continue') : tr('onboarding.joined_flow.go_to_home', 'Go to Home')} busy={busy || !user} />
            </>}
          </motion.div>
        </AnimatePresence>
      </section>
      {typeof step === 'number'
        ? <section className="order-1 h-[340px] min-w-0 sm:h-[420px] lg:order-2 lg:h-[calc(100vh-110px)] lg:max-h-[760px] lg:self-center"><TourScene scene={step} /></section>
        : <section className="hidden min-w-0 items-center justify-center lg:order-2 lg:flex">
          <div className="w-full max-w-[420px] rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{tr('onboarding.joined_flow.what_a_learner_sees', 'What a learner sees')}</p>
            <div className="flex items-end gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e8eef6] text-[12px] font-bold text-[#2F66D6]">{tr('onboarding.joined_flow.pn', 'PN')}</span>
              <p className="rounded-2xl rounded-bl-md bg-[#f3f1ec] px-3.5 py-2.5 text-[14px]"><small className="mb-0.5 block text-[12px] text-muted-foreground">{tr('onboarding.joined_flow.priya_handed_in_r_sum', 'Priya · Handed in Résumé draft')}</small>{tr('onboarding.joined_flow.here_s_my_draft_i', 'Here’s my draft. I wasn’t sure what to put for skills.')}</p>
            </div>
            <div className="mt-3 flex flex-row-reverse items-end gap-2.5">
              <UserAvatar width={32} rounded="rounded-full" />
              <p className="rounded-2xl rounded-br-md bg-[#e8eef6] px-3.5 py-2.5 text-[14px]"><small className="mb-0.5 block text-[12px] text-muted-foreground">{tr('onboarding.joined_flow.shown_reviewed_it', '{{shown}} · Reviewed it', { shown })}</small>{tr('onboarding.joined_flow.strong_start_add_your_certificate', 'Strong start! Add your certificate under skills.')}</p>
            </div>
          </div>
        </section>}
    </main>
    <MediaPickerDialog open={picking} onOpenChange={setPicking} title={tr('onboarding.joined_flow.add_a_profile_photo', 'Add a profile photo')} description={tr('onboarding.joined_flow.upload_an_image_or_choose', 'Upload an image or choose one from your library.')}
      owner={{ type: 'user', id: Number(userId || 0) }} mediaType="image" accessToken={token} onSave={saveAvatar} />
  </div>
}

function Nav({ back, next, label, busy = false }: { back?: () => void; next: () => void; label: string; busy?: boolean }) {
  return <div className="mt-8 flex items-center justify-between gap-3">
    {back ? <Button variant="ghost" className="rounded-full" onClick={back} disabled={busy}><ArrowLeft />{tr('onboarding.joined_flow.back', 'Back')}</Button> : <span />}
    <Button size="lg" className="rounded-full" onClick={next} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null}{label}<ArrowRight /></Button>
  </div>
}
