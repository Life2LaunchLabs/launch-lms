# Framework editor and learner flow verification

Reference: owner follow-up direction of 2026-10-13 and the submitted-step current-state screenshot supplied in the conversation. Reuse the adopted requirement editor, Plan path and Coach shell in `apps/web/design-system/catalog.json`; the learner refresh reference remains selected. The precise changes, surfaces and browser plan are in the [task brief](../plans/active/framework-editor-and-learner-flow.md).

Tested implementation: `8ef53654100ac67013d08e3d892b046e283eb434`. The complete clean-worktree browser run finished at `2026-10-13T21:27:52.437Z`, fingerprint `75a11da44c802486bc6f65640aa48a730f0f684c5c07a42ba3cd1735eb3fb070`. [Run results](framework-editor-and-learner-flow/browser-results.json) preserve all eight scenario outcomes. Subsequent changes add review evidence and capture finite editor transitions at rest; production code is identical to this tested revision.

Synthetic data only: normal login against the actual Next.js/FastAPI application, disposable PostgreSQL `launchlms_flow_test` on port 15433 and Redis on 15434. `seed_requirement_evidence.py` and `seed_learner_flow.py` create isolated standards, plan, invitation and activity fixtures. The owner's actual Oregon draft was read to confirm its 44 nodes; it was never changed or published for this verification.

Chromium desktop 1440×900 and phone 390×844 were exercised. Admin captures use the existing light administration surface; learner captures use the existing dark surface and plan color. I inspected the ten rendered captures against the selected existing layouts and owner's requested changes.

| State | Desktop | Phone |
|---|---|---|
| Free-form hierarchy explanation | [Levels](framework-editor-and-learner-flow/chromium-desktop/manual-framework-levels.png) | [Levels](framework-editor-and-learner-flow/chromium-phone/manual-framework-levels.png) |
| Supplied code and node editor | [Spec](framework-editor-and-learner-flow/chromium-desktop/manual-framework-spec.png) | [Spec](framework-editor-and-learner-flow/chromium-phone/manual-framework-spec.png) |
| Organization and personal invitations | [Invitations](framework-editor-and-learner-flow/chromium-desktop/plan-inviting-organization.png) | [Invitations](framework-editor-and-learner-flow/chromium-phone/plan-inviting-organization.png) |
| Submitted work and next active step | [Waiting on review](framework-editor-and-learner-flow/chromium-desktop/objective-waiting-review.png) | [Waiting on review](framework-editor-and-learner-flow/chromium-phone/objective-waiting-review.png) |
| Focused activity viewer | [Activity](framework-editor-and-learner-flow/chromium-desktop/focused-activity.png) | [Activity](framework-editor-and-learner-flow/chromium-phone/focused-activity.png) |

Findings and corrections:

- Spec now displays the existing hierarchy when no levels are configured. Supplied codes remain readable in the code field and are preserved on save and publish, together with IDs, parents, metadata and source references. The API round trip compares saved and published nodes. Tree labels retain the existing sidebar truncation; the selected node's full name and code remain available in the editor.
- Levels explains the free-form structure. Canceling the explicit generated-code conversion confirmation leaves supplied codes and source metadata intact. Existing level-based frameworks still generate `A.1.1` codes and save correctly.
- Phone testing exposed intrinsic tree width expanding the page and interfering with Save. Explicit zero-minimum grid tracks and constrained panels fix the overflow; the browser asserts the document fits the viewport and exercises the save by a normal tap. Level controls wrap on phones. UUID creation now uses the installed library so adding levels also works on the HTTP test host.
- Invitation rows show the organization, or a personal inviter with the collaborator role. Long copy wraps on the phone without covering Accept and Decline.
- Submitted work uses the filled check node, clock waiting line and secondary Review action. It has no current star, Continue action or Ask Coach prompt. The next open step has the current star; the following dependent step remains locked. The approved completion counter remains `0 of 3` for this fixture.
- The activity surface begins at `(0,0)` and occupies the viewport. It renders actual practice content, progress, finish and an accessible Close activity action. Navigation, page chrome, Coach and phone swipe controls are absent while playing. Closing returns to the plan, and reopening Coach retains the typed draft.

The eight scenarios passed on both viewports. Tests also assert organization attribution, personal fallback, generation/conversion behavior, preservation after publish, next-step selection, viewport geometry and Coach restoration. Existing dependency tests continue to cover requested changes reopening work; this task changes presentation, not approval rules. The small Next.js development indicator and transient save toast in local captures are development/capture artifacts.

Commands (export the disposable database, Redis and synthetic login variables first):

```sh
./scripts/agent doctor
./scripts/agent check --changed
./scripts/agent check --all
UI_TEST_HTTPS=false UI_TEST_PUBLIC_HOST=127.0.0.1.sslip.io UI_TEST_ORG_SLUG=life2launch \
  bash scripts/ui/run-local.sh learner-flow.spec.ts \
  --project=chromium-desktop --project=chromium-phone
```

Agent checks passed: 683 API tests passed, 9 existing skips and 1 expected failure; 63 frontend unit tests passed, with frontend/API lint, types and repository gates. The [editor capture rerun](framework-editor-and-learner-flow/editor-capture-results.json) passed both scenarios and finished at `2026-10-13T21:31:04.102Z`; its fingerprint is `4efda579162e1813b65a4533a3a9967722406335c8cb56430315307dfbced724` (review evidence and the capture helper changed, production code unchanged). The four refreshed editor captures were inspected again with finite transitions at rest; [capture hashes](framework-editor-and-learner-flow/captures.json) identify the final ten images. Owner signoff remains pending; the PR contains owner test steps and exact-head CI/deployment evidence.

CI regression follow-up: [run 38471375555](https://github.com/Life2LaunchLabs/launch-lms/actions/runs/38471375555) passed all six required gates and the new learner-flow scenarios, but the existing long-code test selected the newest imported fixture because it checked for the framework selector before the inventory loaded. The test now waits for the inventory header, explicitly selects the intended fixture and asserts its UUID. Code/title geometry assertions are unchanged. The [six-scenario evidence/export regression run](framework-editor-and-learner-flow/export-regression-results.json) passed across desktop and phone with multiple seeded frameworks, finishing at `2026-10-13T21:47:19.806Z` on base `746767b2f7e0cbad0ddb6c2aebc02df8718f5c5c` plus that test-only correction, fingerprint `f6539f346aed0602667a42f925319f0f80d05417cc0d55896f5a8383a11d4024`. The full agent checks passed again (683 API / 63 frontend unit tests). Production code and the inspected UI remain unchanged; final-head CI is required before merge.
