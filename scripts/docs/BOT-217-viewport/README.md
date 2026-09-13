# BOT-217 responsive shell follow-up

The owner reported remaining banner/Hub sizing and scrolling problems after PR #70. Preserve that earlier implementation and verification report as historical context; it is not acceptance evidence for this follow-up.

The controlling current-state reference is private FEED-5 attachment 10001, revision `69651b2f9c8df4ad4244c64bd7b3564077f75c8f`, 1280×551 CSS pixels. It remains in Jira and must not be committed or included in review uploads. The adopted CandidateExperience pattern and Hub companion split in the component catalog supply the existing design direction. No new shared component or replacement concept is proposed.

Review covers the populated Hub, unstable toolbar, unread announcement, all three panels and mobile tray, including long unbroken labels, focus return, keyboard access, document bounds and nested scrolling. Required sizes are 1280×551, 1280×720 and 390×844 in light and dark themes. All shareable captures use synthetic data.

The browser regression lives at `apps/web/tests/ui/candidate-viewport.spec.ts`. Task evidence will be attached to BOT-217 with an exact tested PR SHA and results. The owner must review that evidence and move the parent to the Jira status `merge` before merging is authorized. Local files and prior green runs do not constitute owner approval.
