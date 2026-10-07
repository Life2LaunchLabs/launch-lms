# Hub launch start (MVP)

Owner authorization: conversation on 2026-10-07, "go ahead and create implementation plan for our mvp".
Delivery branch: not yet created. Branch from `dev`, not from `feat/disposable-demo-checkpoints`
(that branch carries an uncommitted migration that is currently the Alembic head).
Jira configuration: link this plan to a BOT Story/workpad when one exists.

## Outcome

A learner who lands on the Hub always gets a quick answer to "what should I do?", and the Hub
steers them toward having at least one small, living plan.

- **Nothing actionable yet:** a short stack of situation cards. Each card starts a coach
  conversation. The coach's aim is *one small thing the learner can come back to*, saved as a
  tiny plan, not a full plan.
- **Something actionable:** a short stack of up to three ranked next actions (go straight to the
  thing), plus a "Check in" card that starts a coach conversation grounded in their progress.
- **Chat stays the entry point.** The composer is always present; the stack sits above it.

The plan is the grounding scaffold. Badges, resources and portfolio items matter because they
are steps in a plan. This MVP only builds the Hub side of that and the minimum Plans changes it
needs.

## Decisions (owner, 2026-10-07)

1. **No forced "My Launch Plan".** Learners may have several plans/angles; the goal is at least
   one. "One plan" consolidation is deferred. Multiple plans are allowed for now.
2. **A starter plan is tiny and soft.** A name and one to three objectives, such as "check out this
   resource" or "take this quiz". No timelines and no big end goal. It is malleable. Completing
   an objective shows clear progress, and the result is used to add next steps.
3. **Cards are seeds, not an intent system.** A card is `{key, label, first_message, brief}`.
   The brief is guidance for the coach, not a workflow.
4. **Card text is platform-scoped and editable beside the model settings** (the Hub advisor
   settings in platform admin). No per-org cards yet.
5. **Ranking** of next actions, highest first: (1) assigned/org requirements that are due soon or
   need attention, (2) work already in progress (including badge steps), (3) the next unstarted
   objective in the learner's own plans, (4) discovery. Cap three, each with a plain-language
   reason. Assigned work must not crowd out the learner's own goals: cap tier 1 at one item.
6. **Starter plan is created through the existing proposal flow.** The learner reviews and
   saves. The coach never saves anything itself.

## Non-goals (deferred)

Single-plan consolidation and the requirements mapping layer; My People; barriers/support intake;
a discover/resource feed under the stack; per-org card sets; a stored last-visit timestamp;
coach-ranked (model-chosen) cards; reminders or notifications.

## What exists today (scouted 2026-10-07)

- Plan model: `Plan` → `PlanPhase` → `PlanObjective` (+ `fields`, a list of steps of type
  `text | media | link | checkbox | badge`) → `PlanObjectiveProgress`.
  See [planning models](../../../../apps/api/src/db/planning.py). `Plan.due_date` and
  `PlanObjective.due_date` are nullable; an objective with no phase is allowed.
- A single global Hub advisor prompt, admin-editable, in `HubAdvisorConfiguration`
  ([hub models](../../../../apps/api/src/db/hub.py)). Capability rules are code-owned in
  [hub_actions.py](../../../../apps/api/src/services/hub_actions.py).
- Plan co-creation: `create_plan` navigation action → edit run → typed tools that prepare values in
  the real editor ([hub_plan_tools.py](../../../../apps/api/src/services/hub_plan_tools.py)).
  Tools never save. Plan creation currently *requires* a due date, and objective proposals carry no
  steps/links.
- `planning.feed()` is not usable as the next-actions source: it only returns objectives that
  have a due date (within seven days, or any future due date). Undated objectives, which this MVP
  creates on purpose, never appear.
- The Hub UI is mounted by [HubWorkspace.tsx](../../../../apps/web/components/Hub/HubWorkspace.tsx)
  as a persistent sibling of routed pages, in a full mode at `/hub` and a companion panel
  elsewhere. The Hub route's `page.tsx` (under `apps/web/app/orgs/[orgslug]/(withmenu)/hub/`) renders nothing.
- `scripts/source-size.py` ratchets a 500-line limit. `hub_advisor.py` (744), `routers/hub.py`
  (546), `HubExperience.tsx` (1164) and `services/planning.py` (2017) are baselined and **must not
  grow**. Put new code in new modules.

## Design

### 1. Launch cards and coach brief (backend)

- New module `services/hub_launch.py`:
  - `DEFAULT_LAUNCH_CARDS`: 4–6 cards in the learner's voice, e.g. not sure what to do after
    high school; have a career in mind; want to build experience; need to stay on track to graduate.
  - `COACH_FRAME`: code-owned text that every brief sits under: get to one small, concrete
    next action; propose a starter plan only after useful exchange; no dates or end goal unless the
    learner offers one; use catalog resources, never invent links; the learner confirms everything.
  - Validation: 4–6 cards; `key` slug, unique; `label` ≤ 80, `first_message` ≤ 300, `brief` ≤ 1,500
    characters. The reserved key `check_in` is code-owned and rejected in admin input.
- Migration (run `alembic heads` first, per the repo convention):
  `hubadvisorconfiguration.launch_cards` (JSON, nullable; null means code defaults) and
  `hubconversation.launch_key` (nullable `String(40)`).
- Advisor request gains optional `launch_key`. It is honored **only when no `conversation_uuid`
  is supplied** (a new conversation) and is stored on the conversation. Later turns read it from
  the conversation, so the client can neither change nor resend it.
- The brief is appended to the existing capability context in `ask_hub_advisor` as a clearly
  delimited trusted block, via one call into `hub_launch`. This must be net-zero lines in
  `hub_advisor.py` (extract something equal or larger).
- The client never sends brief text. Unknown keys are ignored (the chat proceeds with no brief).
- Admin: extend the Hub advisor configuration update/read models with `launch_cards`; add a
  `HubLaunchCardsEditor` component next to the instructions field in
  [PlatformSettings.tsx](../../../../apps/web/components/Admin/Platform/PlatformSettings.tsx). Reset-to-defaults control.
- New endpoint (new router module beside the Hub router) `GET …/hub/launch` returns the
  effective cards (`key`, `label`, `first_message` only; briefs stay server-side).

### 2. Starter plan through the existing flow

- Make `due_date` optional for new-plan proposals (tool schema, parser, apply path).
- Objective proposals gain an optional `resource_uuid` drawn from the grounding resources. The
  server resolves it to the resource's external URL and builds `fields` (a `link` step and, if
  needed, a `checkbox` step) at proposal time, rejecting unknown or inaccessible resources.
  **Model-supplied URLs are never accepted.** This preserves the rule in
  `CAPABILITY_POLICY_INSTRUCTIONS`.
- Starter plans are phase-less by default. Do not auto-create the five Discover → Capture phases.
- The brief tells the coach the target shape: plan name, one to three objectives, the first of
  which is the small thing to do now.
- Open point: the current `create_plan` handshake asks "should we go create that plan together?".
  For card-seeded conversations keep it in the MVP (no new write path) and measure friction in
  verification.

### 3. Next actions (backend)

- New `services/hub_next_actions.py` plus a `GET …/hub/next-actions` route. Returns at most three:
  `{kind, title, reason, route, plan_uuid?, objective_uuid?, tier}`. `route` is built server-side
  from known destinations, as for suggested actions.
- Query the learner's own accessible active plans and objectives directly. Do not call
  `planning.feed()`. Tier rules from decision 5. Skip completed/canceled objectives. Treat
  `changes_requested`, overdue, or due within seven days as "needs attention". Respect `blocked`.
- Keep it to a small fixed number of queries; do not call `_objective_dict` per objective.
- Empty result means the Hub shows the launch cards. No stored "new/returning" state.
- **Check in**: `launch_key = check_in`. The server builds a short digest each turn (objectives
  completed since the learner's last Hub conversation, due or overdue, assigned items, in-progress
  work) and appends it with a check-in brief. The "last time" proxy is the most recent
  `HubConversation.updated_at`; no new column. Recomputing per turn keeps the coach current
  after the learner saves plan changes.

### 4. Hub UI

- New components, not edits to `HubExperience.tsx` beyond mounting: `HubLaunchCards.tsx`,
  `HubNextActions.tsx`, and `services/hub/launch.ts` (SWR via service functions, per repo rules).
- Layout: centered stack, composer anchored below, existing recent conversations moved to a
  quieter section. Full-Hub mode only; the companion panel is unchanged.
- Card click: start a conversation with the card's `first_message` as the learner's visible
  message and the `launch_key`. Next-action click: navigate directly, no chat.
- "Quiet the chaos": at most three actions plus Check in; one primary visual weight; reason text
  small and plain; no completion percentages. Needs-attention wording never reads as failure.
- Semantic tokens only; verify light and dark, 1440x900 and 390x844, loading/empty/error states.
  Follow [design guidance](../../../design/README.md).

## Acceptance criteria

- [ ] A platform admin can edit, add, remove and reset the cards; invalid input is rejected with a clear message.
- [ ] A learner with no actionable items sees the cards; clicking one starts a conversation whose coach follows that card's brief on every later turn.
- [ ] The client cannot change or spoof a brief: `launch_key` on an existing conversation and unknown keys have no effect.
- [ ] The coach can propose a plan with no due date and objectives with catalog-resolved links. The learner reviews and saves; nothing saves without the learner.
- [ ] A saved link/checkbox objective can be completed by the learner in one clear action and shows as complete.
- [ ] A learner with a saved undated objective sees it in the next actions on their next visit.
- [ ] Next actions follow the ranking, are capped at three with at most one assigned item, and each shows a reason.
- [ ] Check in's coach receives a digest of current plan state and references real changes only.
- [ ] No baselined source file grew; `scripts/source-size.py`, lint, architecture and docs checks pass.

## Verification plan

- API tests (SQLite): card validation and defaults; `launch_key` set-once and spoof resistance;
  brief present in the provider call and absent from every client response; optional-date plan
  proposals; resource-to-link resolution including rejection of inaccessible and unknown
  resources; next-action ranking, cap, tier-1 cap, undated inclusion, blocked/completed exclusion.
- Web unit tests for the service and card/next-action rendering.
- Browser UI spec using the deterministic UI-test provider
  ([hub_advisor.py](../../../../apps/api/src/services/hub_advisor.py)): new learner clicks a card, the
  coach proposes a starter plan, the learner saves it, returns, and sees the objective as the first
  action. Also check keyboard focus, a phone viewport, and dark mode.
- Run the `verify` skill against the live dev stack before merge, with the user's dev server
  workflow (Henry runs `./launch-lms dev`; do not start a second stack).
- Update [docs/product/map/05-pathways.json](../../../product/map/05-pathways.json) with the new
  Hub actions once behavior ships.

## Phases

1. **Foundations.** Branch from `dev`; confirm `alembic heads`; migration; `hub_launch.py`; advisor `launch_key` plumbing and brief injection; tests.
2. **Admin editing.** Config read/update models, editor component, defaults and reset.
3. **Starter plan.** Optional due date, resource-resolved link steps, brief shaping; confirm the completion and phase-less behavior in the Plans UI (open risks below).
4. **Next actions.** Service, route, ranking tests, Check in digest.
5. **Hub UI.** Launch cards, next actions, layout, states, browser spec.
6. **Close-out.** Product map, evidence recorded here, move to `completed/`.

Phases 1–2 and phase 4 are independent after the migration and can proceed in parallel.

## Open risks and questions

- Can a learner complete an objective whose only steps are a link and a checkbox, with one action? Confirm in `update_objective_progress` and the Plans UI before building phase 3.
- Does the Plans UI render a phase-less plan sensibly? If not, a single implicit phase is the fallback.
- **Content dependency:** the coach can only link to what the catalog contains. Seed a few trusted quiz/exploration resources before launch, or the starter objective falls back to a plain-text action.
- Cost of next actions on every Hub load; measure query count and consider short caching if needed.
- The brief is admin-authored trusted text. Only platform admins can edit it, and it is delimited in the prompt. Do not route learner-written content into it.
- Setting `launch_key` requires creating the conversation record before or with the first answer; confirm the creation path in `record_advice` and that failed provider calls don't orphan a conversation.

## Recovery

The migration only adds nullable columns. If the feature misbehaves: clear `launch_cards` (code
defaults apply) and hide the cards behind a single front-end switch; existing conversations and
plans are unaffected. No data is rewritten.
