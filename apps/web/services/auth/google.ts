import { useEffect, useState } from 'react'
import { getAPIUrl } from '@services/config/config'

// Whether "Continue with Google" is on: it turns on once Platform › Settings holds both the client ID and the
// secret (or the environment turns it on). An API without the status route predates that switch, so Google
// stays shown there as before; any other failure hides it.

let asked: Promise<boolean> | null = null

export function googleSignInEnabled(): Promise<boolean> {
  asked ||= fetch(`${getAPIUrl()}auth/google/status`, { credentials: 'omit' })
    .then(async (response) => response.status === 404 ? true : response.ok ? Boolean((await response.json())?.enabled) : false)
    .catch(() => false)
  return asked
}

/** False until the API says Google sign-in is on, so the button never shows and then disappears. */
export function useGoogleSignIn(): boolean {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let live = true
    void googleSignInEnabled().then((value) => { if (live) setEnabled(value) })
    return () => { live = false }
  }, [])
  return enabled
}
