'use client'

import type { ChangeEventHandler } from 'react'

/** The username is the public portfolio link, so it's picked at sign-up rather than made from the email. */
export default function UsernameInput({ value, onChange }: { value: string; onChange: ChangeEventHandler<HTMLInputElement> }) {
  return <input
    name="username"
    onChange={onChange}
    value={value}
    type="text"
    placeholder="Pick a username"
    aria-label="Username"
    autoComplete="username"
    autoCapitalize="none"
    spellCheck={false}
    maxLength={30}
    pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{2,29}"
    title="3 to 30 letters, numbers, dots, dashes or underscores"
    className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-[16px] text-gray-950 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
    required
  />
}
