'use client'

import Link from 'next/link'
import { useTranslation } from 'react-i18next'

/**
 * Login that comes back to this invitation or join link with the email filled in, so someone who
 * already has an account isn't stranded at "Email already exists" (DEV-42, FEED-284/285).
 */
export function inviteLoginHref(pathname: string, search: string, email?: string): string {
  return `/login?${new URLSearchParams({ next: `${pathname}${search ? `?${search}` : ''}`, ...(email ? { email } : {}) })}`
}

export default function AccountExistsNotice({ loginHref }: { loginHref: string }) {
  const { t } = useTranslation()
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl bg-blue-50 p-4 text-left text-blue-950 nice-shadow" role="status">
      <div className="text-sm">
        <p className="font-bold">{t('auth.invite_account_exists_title')}</p>
        <p className="mt-1">{t('auth.invite_account_exists_body')}</p>
      </div>
      <Link href={loginHref} className="inline-flex h-10 items-center justify-center rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white no-underline hover:bg-gray-800">
        {t('auth.invite_account_exists_login')}
      </Link>
    </div>
  )
}
