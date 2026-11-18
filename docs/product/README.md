# Product map

The Launch LMS product map lives in Confluence: LLMS › Product map
(https://henrydker.atlassian.net/wiki/spaces/LLMS/database/98368). It holds the
stable Group → Goal → Activity hierarchy with each activity's steps, state,
health, verification, release, test coverage, feature and notes.

Planning and release keeps it. Development does not edit it; a change that adds,
retires or reshapes an activity is noted on its Jira ticket and Planning updates
the map. Activity IDs are permanent and never recycled.

The JSON copy that used to live in `docs/product/map/` was removed in DEV-185
(2026-11-18) after every activity and its implementation notes, acceptance
criteria and code/test references were carried into the Confluence database.
Earlier history is in git.
