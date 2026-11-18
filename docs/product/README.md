# Product system of record

The Launch LMS product map (Group → Goal → Activity → Step, with lifecycle
state, acceptance criteria, implementation notes and code and test references)
lives in Confluence: **LLMS › Product map** (database 98368 on
henrydker.atlassian.net). Project management keeps it. It used to be stored
here as `docs/product/map/*.json`; that copy was removed in DEV-185 and every
activity, including its repo-only notes, is in the database's Notes column.

Version outcomes and their done-when checks are on the version pages under
**LLMS › Roadmap and releases**, and each outcome is one DEV Story in Jira.
Don't add product map files to this repository; name the Product map activity
ids in the outcome Story or pull request instead.
