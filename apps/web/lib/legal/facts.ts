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
  'Coach memory is on by default. Coach saves short notes from what a learner tells it (goals, preferences, constraints and background) so later answers fit them, and skips anything that looks like a password, health, identity, money or legal matter, or contact details. Only the learner sees their memories, in Account › Memory, where they can edit or delete each one, clear them all, or turn memory off. Memories belong to one organization and are not shown to its staff.'

/** Uploads: services/utils/upload_content.py names each file with a random UUID; content routers serve it to anyone with the address (DEV-37 adds access checks). */
export const UPLOAD_LINKS =
  'Each uploaded file gets a long, random address that is hard to guess, but today anyone who has that address can open the file without signing in. Share file links with care. We are adding sign-in checks to uploaded files.'

/** Discover images: lib/ownServerImage.ts serves pictures from other websites through Life2Launch. */
export const OUTSIDE_IMAGES =
  'Pictures for resources on Discover that come from other websites are fetched by Life2Launch’s own server and shown from Life2Launch, so those websites never see a learner’s address.'

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
