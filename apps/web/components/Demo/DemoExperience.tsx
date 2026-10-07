'use client'
import { useCallback, useEffect, useState, useRef } from 'react'
import { ArrowLeft, FlaskConical, RotateCcw, Settings, LogOut, Save, Info } from 'lucide-react'
import { useSession } from '@components/Contexts/AuthContext'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { demoRequest, announceDemoSetupChange, DemoRequestError, type DemoStatus } from '@services/demo/demo'
import DemoSettingsPanel from './DemoSettingsPanel'
import DemoToolbar from './DemoToolbar'
import { getConfig } from '@services/config/config'
import { usePathname } from 'next/navigation'

export default function DemoExperience() {
  const session = useSession()
  const [state, setState] = useState<DemoStatus | null>(null)
  const [panel, setPanel] = useState(false)
  const [confirmation, setConfirmation] = useState<'reset' | 'end' | 'publish' | null>(null)
  const [warning, setWarning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const confirmationFocus = useRef<HTMLButtonElement | null>(null)
  const warningFocus = useRef<HTMLElement | null>(null)
  const warnedExpiry = useRef('')
  const demoHost = getConfig('NEXT_PUBLIC_LAUNCHLMS_DEMO_HOST', 'demo.life2launch.app')
  const onDemoHost = typeof window !== 'undefined' && (window.location.hostname === demoHost || window.location.hostname.endsWith(`.${demoHost}`))
  const pathname = usePathname()
  const showBar = Boolean(state && state.mode !== 'public' && (!onDemoHost || state.mode === 'visitor') && (state.mode !== 'operator' || pathname === '/demo'))
  const refresh = useCallback(async () => {
    try { setState(await demoRequest<DemoStatus>('status')) }
    catch (failure) {
      if (state?.mode === 'visitor') {
        if (failure instanceof DemoRequestError && failure.status === 401) window.location.assign('/demo?ended=1')
        else setError((failure as Error).message)
      }
    }
  }, [state?.mode])
  useEffect(() => {
    if (session.status === 'loading') return
    void refresh()
    const interval = window.setInterval(() => void refresh(), 30000)
    window.addEventListener('demo-setup-changed', refresh)
    return () => { window.clearInterval(interval); window.removeEventListener('demo-setup-changed', refresh) }
  }, [session.status, refresh])
  useEffect(() => {
    if (state?.mode !== 'visitor' || !state.expires_at) return
    const expiresAt = state.expires_at
    function checkExpiry() {
      const remaining = Date.parse(expiresAt) - Date.now()
      if (remaining <= 300000 && warnedExpiry.current !== expiresAt) {
        warnedExpiry.current = expiresAt
        setWarning(true)
      } else if (remaining > 300000) setWarning(false)
      if (remaining <= 0) window.location.assign('/demo?ended=1')
    }
    checkExpiry()
    const interval = window.setInterval(checkExpiry, 10000)
    return () => window.clearInterval(interval)
  }, [state?.mode, state?.expires_at])
  useEffect(() => {
    document.documentElement.style.setProperty('--demo-bar-height', showBar ? '3rem' : '0px')
    return () => { document.documentElement.style.removeProperty('--demo-bar-height') }
  }, [showBar])
  async function act(action: string) {
    setBusy(true); setError(''); setNotice('')
    try {
      if (action === 'checkpoints') {
        await demoRequest(action, 'POST', { revision: state?.settings?.revision })
        setNotice('Checkpoint saved. New visitors will start here.')
        setConfirmation(null); announceDemoSetupChange(); await refresh()
      } else if (action === 'extend') {
        const result = await demoRequest<{ expires_at: string }>(action, 'POST')
        setState((previous) => previous ? { ...previous, expires_at: result.expires_at } : previous)
        setWarning(false)
      } else {
        const result = await demoRequest<{ tokens?: { entry_org_slug: string } }>(action, 'POST')
        if (action === 'end') window.location.assign('/demo?ended=1')
        else if (action === 'reset') window.location.assign('/demo?preparing=1')
        else if (action === 'admin/enter') window.location.assign(`/orgs/${encodeURIComponent(result.tokens?.entry_org_slug || 'default')}/hub`)
        else if (action === 'admin/exit') window.location.assign('/demo')
        else window.location.assign('/')
        void result
      }
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }
  if (!state || !showBar) return null
  const visitor = state.mode === 'visitor'
  const admin = state.mode === 'admin'
  return <>
    <DemoToolbar>
      <div className="flex min-w-0 items-center gap-2"><FlaskConical className="h-4 w-4 shrink-0" /><span className="whitespace-nowrap text-sm font-semibold">{visitor ? 'Demo' : admin ? 'Demo admin' : 'Demo controls'}</span><span className="hidden truncate text-xs sm:inline">{visitor ? 'Changes are temporary' : admin ? 'Editing live account · Changes persist' : 'Manage the fictional demo cohort'}</span></div>
      <div className="flex shrink-0 items-center gap-1">
        {visitor && <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm" aria-label="Demo limits"><Info className="h-4 w-4" /></Button></PopoverTrigger><PopoverContent align="end" className="w-[min(22rem,calc(100dvw-1.5rem))] space-y-3 rounded-2xl p-5 text-sm"><h2 className="font-semibold">What works in this demo</h2><p>Badges, plans, resources and live chat work in your private copy.</p><p>Emails are simulated. Payments and changes to external services are unavailable.</p><p>Chat has a demo allowance; the app explains when you reach it. Resetting does not renew that allowance.</p></PopoverContent></Popover>}
        {visitor ? <><Button variant="ghost" size="sm" disabled={busy} onClick={(event) => { confirmationFocus.current = event.currentTarget; setConfirmation('reset') }}><RotateCcw className="mr-1 h-3.5 w-3.5" /><span>Reset</span></Button><Button variant="ghost" size="sm" aria-label="Back to demo users" disabled={busy} onClick={(event) => { confirmationFocus.current = event.currentTarget; setConfirmation('end') }}><ArrowLeft className="mr-1 h-3.5 w-3.5" /><span>Back</span></Button></> : <>
          {admin ? <Button size="sm" disabled={busy} onClick={(event) => { confirmationFocus.current = event.currentTarget; setConfirmation('publish') }}><Save className="mr-1 h-3.5 w-3.5" />Save checkpoint</Button> : null}
          <Popover open={panel} onOpenChange={setPanel}><PopoverTrigger asChild><Button variant="ghost" size="sm" aria-label="Demo settings"><Settings className="h-4 w-4" /></Button></PopoverTrigger><PopoverContent align="end" className="max-h-[80dvh] w-[min(30rem,calc(100dvw-1.5rem))] overflow-hidden rounded-2xl p-0">{state.settings && <DemoSettingsPanel key={state.settings.revision} settings={state.settings} readyWorkspaces={state.ready_workspaces} onSaved={() => { setPanel(false); void refresh() }} />}</PopoverContent></Popover>
          {admin && <Button variant="ghost" size="sm" aria-label="Switch demo user" disabled={busy} onClick={() => void act('admin/exit')}><LogOut className="h-4 w-4" /></Button>}
        </>}
      </div>
    </DemoToolbar>
    {(error || notice) && <div role={error ? 'alert' : 'status'} className={`border-b px-5 py-2 text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}>{error || notice}</div>}
    <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!busy && !open) setConfirmation(null) }}><DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); confirmationFocus.current?.focus() }} className="max-w-[calc(100dvw-2rem)] sm:max-w-lg"><DialogHeader><DialogTitle>{confirmation === 'publish' ? 'Publish the whole demo scenario?' : confirmation === 'reset' ? 'Start again from the latest checkpoint?' : 'Back to demo users?'}</DialogTitle><DialogDescription>{confirmation === 'publish' ? 'New visitors will receive the whole designated fictional cohort, programs and progress. Existing demo sessions stay unchanged.' : 'Your changes will be deleted, including work in other tabs. You can always start a fresh demo.'}</DialogDescription></DialogHeader><DialogFooter className="mt-5 gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button><Button disabled={busy} onClick={() => void act(confirmation === 'publish' ? 'checkpoints' : confirmation!)}>{busy ? 'Please wait…' : confirmation === 'publish' ? 'Save checkpoint' : confirmation === 'reset' ? 'Reset demo' : 'Back to demo users'}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={warning} onOpenChange={setWarning}><DialogContent onOpenAutoFocus={() => { warningFocus.current = document.activeElement as HTMLElement }} onCloseAutoFocus={(event) => { event.preventDefault(); warningFocus.current?.focus() }} className="max-w-[calc(100dvw-2rem)] sm:max-w-lg"><DialogHeader><DialogTitle>Want more time to explore?</DialogTitle><DialogDescription>Your demo session ends in five minutes. Extend it to keep your current work, or return to demo users and discard your changes.</DialogDescription></DialogHeader><DialogFooter className="mt-5 gap-2"><Button variant="outline" disabled={busy} onClick={() => void act('end')}>Back to demo users</Button><Button disabled={busy} onClick={() => void act('extend')}>{busy ? 'Extending…' : 'Extend session'}</Button></DialogFooter></DialogContent></Dialog>
  </>
}
