'use client'

import React from 'react'
import AccountPageShell from '@components/Objects/Account/AccountPageShell'
import AccountUsername from '@components/Objects/Account/subpages/AccountUsername'
import AccountSignInMethods from '@components/Objects/Account/subpages/AccountSignInMethods'
import AccountMemory from '@components/Objects/Account/subpages/AccountMemory'
import AccountPreferences from '@components/Objects/Account/subpages/AccountPreferences'
import AccountLanguage from '@components/Objects/Account/subpages/AccountLanguage'
import AccountAccessibility from '@components/Objects/Account/subpages/AccountAccessibility'
import AccountData from '@components/Objects/Account/subpages/AccountData'
import AccountEmailNotifications from '@components/Objects/Account/subpages/AccountEmailNotifications'
import AccountEmailAddresses from '@components/Objects/Account/emails/AccountEmailAddresses'

/** Where each old account tab now sits on the one Settings page. */
const SECTIONS: Record<string, string> = { preferences: 'appearance', language: 'language', accessibility: 'accessibility', memory: 'memory', data: 'data', emails: 'emails', contact: 'account-emails' }

const AccountClient = ({ subpage }: { orgslug: string; subpage: string }) => {
  // Old links to a tab land on its section.
  React.useEffect(() => {
    const section = SECTIONS[subpage]
    if (!section) return
    // The cards above load their settings after this runs and push the section down, and a page
    // opened from Coach's panel is still letting go of its frozen place. Keep the section in view
    // while that settles, until the person scrolls themselves (DEV-144).
    const keep = () => document.getElementById(section)?.scrollIntoView({ block: 'start' })
    const frame = window.requestAnimationFrame(keep)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(keep)
    observer?.observe(document.body)
    const stop = () => { observer?.disconnect(); window.clearTimeout(timer) }
    const timer = window.setTimeout(stop, 2500)
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
    events.forEach((name) => window.addEventListener(name, stop, { once: true, passive: true }))
    return () => { window.cancelAnimationFrame(frame); stop(); events.forEach((name) => window.removeEventListener(name, stop)) }
  }, [subpage])

  return (
    <AccountPageShell>
      <div className="space-y-6">
        {/* The account (PF-3): username, emails and phone, ways to sign in. Personal details live in the portfolio. */}
        <section id="account" className="scroll-mt-6 space-y-6"><AccountUsername /><AccountEmailAddresses /><AccountSignInMethods /></section>
        <section id="emails" className="scroll-mt-6"><AccountEmailNotifications /></section>
        <section id="language" className="scroll-mt-6"><AccountLanguage /></section>
        <section id="accessibility" className="scroll-mt-6"><AccountAccessibility /></section>
        <section id="appearance" className="scroll-mt-6"><AccountPreferences /></section>
        <section id="memory" className="scroll-mt-6"><AccountMemory /></section>
        <section id="data" className="scroll-mt-6"><AccountData /></section>
      </div>
    </AccountPageShell>
  )
}

export default AccountClient
