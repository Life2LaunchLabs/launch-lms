/* The console's "Add personas" box: one persona per line. Kept free of imports so node:test can load it. */

/** has_account: an existing learner; new_signup: just signed up, lands where a sign-up does; org_creator: just signed up, lands on org set-up; org_owner: runs a test org; invitee: no account yet, only an address a persona invites. */
export type StartState = 'has_account' | 'new_signup' | 'org_creator' | 'org_owner' | 'invitee'
export type NewPersona = { first_name: string; last_name?: string; brief?: string; start_state?: StartState; org_name?: string }

const LINE_PREFIXES: Record<string, StartState> = { owner: 'org_owner', new: 'new_signup', creator: 'org_creator', invite: 'invitee' }

/** "First Last | brief" per line; "owner:" also gets a test org, "new:" just signed up, "creator:" just signed up to set up an org, "invite:" has no account yet. */
export function parsePersonaLines(text: string): NewPersona[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const prefix = line.match(/^(owner|new|creator|invite):\s*/i)
    const kind = prefix?.[1].toLowerCase()
    const [name, ...rest] = line.slice(prefix?.[0].length ?? 0).split('|')
    const [first_name, ...last] = name.trim().split(/\s+/)
    return { first_name, last_name: last.join(' '), brief: rest.join('|').trim(), start_state: (kind && LINE_PREFIXES[kind]) || 'has_account' }
  })
}
