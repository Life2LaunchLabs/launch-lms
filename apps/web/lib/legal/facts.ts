// Facts the legal pages (/data, /privacy) both state, in one place so they cannot disagree.
// Each is what the code makes true today (the file that makes it true is named), or a policy
// Henry set on 2026-11-16 for v0.10.0 (DEV-50). Change the code and this file together.

/** The AI companies Coach uses: services/hub_advisor.py calls the OpenAI and Anthropic APIs directly; captions use OpenAI transcription. */
export const AI_PROVIDERS = {
  names: 'OpenAI and Anthropic',
  summary:
    'Coach, the AI helper, runs on models from OpenAI and Anthropic, called directly through their business APIs; Life2Launch’s Coach settings choose which one answers. Video captions use OpenAI’s transcription. When someone uses Coach, the company answering receives what they type and the plan, steps and work Coach needs to answer.',
  terms:
    'Neither company trains its models on data sent through its API. Each keeps requests for up to 30 days to watch for abuse, then deletes them; Anthropic can keep content its safety systems flag for up to 2 years. Life2Launch asks OpenAI not to store Coach conversations.',
}

/** Coach memory: services/hub_memory.py and db/hub.py HubMemoryPreference (enabled defaults to true). */
export const COACH_MEMORY =
  'Coach memory is on by default. Coach saves short notes from what a learner tells it (goals, preferences, constraints and background) so later answers fit them, and skips anything that looks like a password, health, identity, money or legal matter, or contact details. Only the learner sees their memories, in Account › Memory, where they can edit or delete each one, clear them all, or turn memory off. A deleted memory is erased, not hidden: its words are removed everywhere Life2Launch kept them, including Download my data. Memories belong to one organization and are not shown to its staff.'

/** Uploads: services/utils/upload_content.py names each file with a random UUID; content routers serve it to anyone with the address (DEV-37 adds access checks). */
export const UPLOAD_LINKS =
  'Each uploaded file gets a long, random address that is hard to guess, but today anyone who has that address can open the file without signing in. Share file links with care. We are adding sign-in checks to uploaded files.'

/** Discover images: lib/ownServerImage.ts serves pictures from other websites through Life2Launch. */
export const OUTSIDE_IMAGES =
  'Pictures for resources on Discover that come from other websites are fetched by Life2Launch’s own server and shown from Life2Launch, so those websites never see a learner’s address.'

/** Coach retention: services/coach/retention.py deletes each kind of Coach data after these periods; Henry set them on 2026-11-16 (DEV-125). */
export const COACH_RETENTION_LEAD =
  'Coach keeps what it knows about a learner only for set periods. After that, Life2Launch deletes it automatically, leaving no copy of the words behind:'
export const COACH_RETENTION: [string, string][] = [
  ['Coach memories', 'Deleted 12 months after Coach last used them, or after they were saved or edited if Coach never used them. A learner can delete them sooner at any time.'],
  ['Coach conversations', 'Deleted 24 months after their last message, along with the answers, the questions Coach asked and any reports about them. A learner can delete a conversation sooner.'],
  ['Reports of a Coach answer', 'When a learner reports an answer, a copy of that conversation without their name goes to our coaching team. It is deleted after 12 months, or sooner if the conversation is deleted.'],
  ['Leaving an organization', 'A learner’s Coach memories and conversations in that organization are deleted 60 days after they leave it, unless they rejoin first.'],
  ['Closing an account', 'All Coach data goes with the account, within 30 days of the request.'],
]

/** Logs and error reports: Sentry (send_default_pii off) and server logs, policy set 2026-11-16. */
export const LOG_RETENTION =
  'Server logs and error reports are kept for up to 90 days and then deleted. Error reports carry no names, email addresses, IP addresses or cookies.'

/** Deletion: services/users/files.py delete_user_and_files removes the account, everything tied to it and its uploads (DEV-56); 30 days is the policy set 2026-11-16. */
export const DELETION = {
  how: 'A learner, parent or school can ask for an account and its data to be deleted, through the school’s Life2Launch admin or by emailing team@life2launch.com. We confirm who is asking, then delete it within 30 days. An organization can also ask us to delete the organization and everything in it.',
  effect:
    'Deleting an account removes it and everything tied to it (plans, work, messages, uploaded files, Coach conversations and memories). The one exception: a frozen Education Plan and Profile review copy that a school made with the learner’s agreement stays with that school.',
}

/** Download my data: services/users/data_export.py, Account › Your data. */
export const SELF_EXPORT = 'Anyone signed in can download a copy of everything Life2Launch keeps about them, as one file, from Account › Your data.'

/** Age: services/auth/age_check.py checks every self-service sign-up; accounts a school's single sign-on provisions skip it (Terms of Use). */
export const AGE_CHECK =
  'Accounts are only for people aged 13 and over. Every way to sign up on your own asks for a date of birth and refuses anyone younger. When a school signs its students in through its own single sign-on, Life2Launch does not ask again: under our Terms of Use the school confirms that everyone it enrolls is 13 or older.'

/** Date of birth: db/users.py User.birth_date, kept from sign-up (DEV-139, Henry 2026-11-17); left out of every API response, included in Download my data. */
export const BIRTH_DATE =
  'Life2Launch keeps the date of birth given at sign-up on the account, so it can suggest things that fit a person’s age (for example, planning for retirement) and show opportunities that have an age limit. The person can see it in Download my data. Their organization’s staff, helpers and other people never see it; only the few Life2Launch staff who run the service can. Accounts made through a school’s single sign-on, or before Life2Launch began keeping it, have no date of birth stored.'
