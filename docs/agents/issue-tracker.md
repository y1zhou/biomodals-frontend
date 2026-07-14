# Issue tracker: GitHub

Issues and PRDs for this repository live in GitHub Issues at
`y1zhou/biomodals-frontend`. Use the `gh` CLI for issue operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
- **Read an issue**: `gh issue view <number> --comments`, including its labels.
- **List issues**: use `gh issue list` with the appropriate state and label
  filters and request structured JSON when a skill must process the results.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: use `gh issue edit <number> --add-label "..."` or
  `--remove-label "..."`.
- **Close an issue**: `gh issue close <number> --comment "..."`.

Run commands from this clone so `gh` infers the repository from its remote.

## Pull requests as a triage surface

**PRs as a request surface: no.** External pull requests do not enter the issue
triage state machine. Review or address a pull request only when the user asks
for that PR workflow.

GitHub shares one number space across issues and pull requests. If a reference
is ambiguous, try `gh pr view <number>` and then `gh issue view <number>`.

## Skill vocabulary

When a skill says to "publish to the issue tracker," create a GitHub issue.
When it says to "fetch the relevant ticket," use
`gh issue view <number> --comments`.

## Wayfinding operations

The `wayfinder` map is one GitHub issue labelled `wayfinder:map`; its child
tickets are GitHub sub-issues when that feature is available.

- Label child tickets `wayfinder:research`, `wayfinder:prototype`,
  `wayfinder:grilling`, or `wayfinder:task` according to their work.
- If sub-issues are unavailable, list children in the map body and start each
  child with `Part of #<map>`.
- Use GitHub's native issue dependencies for blocking edges. If dependencies
  are unavailable, record `Blocked by: #<number>` at the top of the child.
- The frontier is the first open, unassigned child in map order whose blockers
  are all closed.
- Claim a child with `gh issue edit <number> --add-assignee @me` before the
  first write.
- Resolve a child by posting its answer, closing it, and adding the resulting
  decision or context pointer to the map.
