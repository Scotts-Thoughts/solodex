# Issues — in-app bug reports, the relay, and the /issues skill

Users report bugs from inside Solodex: press the bug button, mark up the
screenshot, describe the problem, attach files, submit. The report is saved
on their machine and sent through a small Cloudflare Worker (`relay/`) that
files it as a GitHub issue on this repo. The developer works the queue with
the `/issues` Claude Code skill, which fixes each issue, posts a technical
note and a plain-language note, and relabels it `status:fix-applied`. The
developer verifies and closes (**Resolved**); closed issues can be reopened.
Reporters see the status and the plain-language note in their own app.

---

## Architecture

```
 reporter's PC                              Cloudflare Worker (free)                 GitHub (public)
 ┌──────────────────────────────┐  PUT /v1/files/<yyyy>/<id>/<name>   ┌───────────────────────────────────┐
 │ Solodex main process         │ ──(body passed through, 0 parse)──▶ │ Scotts-Thoughts/                   │
 │  userData/issues/<id>/       │  POST /v1/issues  (small JSON)       │   solodex-issue-attachments        │
 │  local copy + outbox         │ ──────────▶ "solodex-issues" ───────▶│   issues/<yyyy>/<id>/screenshot.png│
 │                              │ ◀────────── {number,url}   2 PATs    │ Scotts-Thoughts/solodex — Issues   │
 └──────────────┬───────────────┘                                      │   labels status:* , from:app       │
                │ GET api.github.com/repos/…/issues/N (+ETag,           └────────────────▲───────────────────┘
                │ unauthenticated) → status + resolution note                            │ gh CLI
                ▼                                                                        │
     "My reports" panel                     developer's PC: Claude Code `/issues` ───────┘
                                            fetch → look at screenshot → fix → verify → 2 comments → relabel → commit "(#N)"
                                            developer's app (Developer Mode): Resolve / Reopen via gh
                                            GitHub Action keeps labels in step with close/reopen from the web UI
```

---

## Module map

| File | Purpose |
|---|---|
| `src/shared/issues.ts` | Types shared by main, renderer and scripts: `IssueRecord`, `IssueDiagnostics`, limits, name sanitising, `mapRemoteStatus`, `extractNotes`, the note markers |
| `src/main/issues/index.ts` | IPC handlers (`issue-*`, `dev-*`), screenshot capture (`capturePage`), Developer Mode, startup/periodic sync |
| `src/main/issues/store.ts` | On-disk store `<userData>/issues/<id>/` (`issue.json`, screenshots, `attachments/`) |
| `src/main/issues/transport.ts` | Relay client (`submit`) and unauthenticated GitHub status reads with ETags (`fetchStatus`) |
| `src/main/issues/sync.ts` | Outbox with backoff, status refresh throttling |
| `src/main/issues/gh.ts` | Developer Mode backend: `gh issue list / close / reopen`, label creation |
| `src/main/issues/config.ts` | `ISSUES_RELAY_URL`, `ISSUES_APP_KEY`, attachments repo — **edit after deploying the Worker** |
| `src/main/issues/zip.ts` | Store-only ZIP writer for "Export .zip" |
| `src/renderer/src/components/issues/` | `IssueButton`, `IssueReporter` (state machine), `AnnotationOverlay`/`AnnotationCanvas`, `IssueForm`/`AttachmentDropZone`, `IssueSubmitResult`, `IssuesPanel`/`IssueDetail`, `useIssuesUi` |
| `src/renderer/src/utils/issues/` | `annotation.ts` (geometry, compositing), `attachments.ts`, `context.ts` (app state → diagnostics), `errorLog.ts` (error ring buffer), `miniMarkdown.ts`, `issueBody.ts` |
| `relay/src/` | Cloudflare Worker: `index.ts` (HTTP), `validate.ts`, `format.ts` (issue body builder/parser — the single source of the format), `github.ts` |
| `scripts/issues/index.ts` | `npm run issues:list \| issues:fetch \| issues:labels \| issues:import` |
| `.claude/skills/issues/` | The `/issues` skill and its comment templates |
| `.github/workflows/issue-status.yml` | Label sync on open / close / reopen |
| `.github/ISSUE_TEMPLATE/bug.yml` | Hand-filed bugs enter the same queue (`status:open`) |

---

## Status model

| Label | Colour | Meaning | The app shows |
|---|---|---|---|
| `status:open` | `d93f0b` | reported or reopened, not yet worked | Open |
| `status:fix-applied` | `1d76db` | fixed in the repo, awaiting release + verification | Fix applied (+ the resolution note) |
| `status:needs-info` | `fbca04` | Claude asked the reporter a question | Needs more information (+ the question) |
| `status:decision` | `c5def5` | parked for a product decision / feature request | Under review |
| `from:app` | `5319e7` | filed through the relay | — |

**Resolved is simply the closed state** (`state_reason: completed`); closed as
not planned shows as "Closed (not planned)". One function derives the status
everywhere (`mapRemoteStatus` in `src/shared/issues.ts`, also used by the
scripts): `closed` → resolved / not-planned; else by `status:*` label; no
label → open.

Transitions:

| From | Event | By | To |
|---|---|---|---|
| — | report submitted | relay | `status:open` + `from:app` |
| — | issue filed by hand | template / workflow | `status:open` |
| `status:open` | fixed, verified, two notes posted | `/issues` | `status:fix-applied` |
| `status:open` | cannot reproduce | `/issues` | `status:needs-info` |
| `status:open` | needs a decision / feature request | `/issues` | `status:decision` |
| `needs-info`, `decision` | developer relabels after answering | `gh issue edit N --add-label status:open --remove-label …` | `status:open` |
| any open | **Resolved** (panel button, `/issues resolve N`, `gh issue close`, web UI) | developer | closed; workflow removes `status:*` |
| closed | **Reopen** (panel, `/issues reopen N`, `gh issue reopen`, web UI) | developer | open + `status:open`; the skill sees the earlier fix note and treats it as reopened |

Commits reference issues as `(#N)`. Never `fixes #N` / `closes #N` — GitHub
would close the issue when the commit lands on `main`, before verification.

---

## Issue format

Title = the reporter's title. Labels `status:open`, `from:app`. Body:

```
_Reported from Solodex 1.8.16 · win32 x64 · Platinum · damage view · Garchomp_

<description, or "_No description provided._">

### Screenshot
![screenshot](https://raw.githubusercontent.com/Scotts-Thoughts/solodex-issue-attachments/main/issues/2026/<id>/screenshot.png)

### Attachments
- ![photo.jpg](…/photo.jpg) — 1.9 MB          ← images embedded
- [crash.log](…/crash.log) — 12 KB             ← text linked

<details><summary>Diagnostics</summary>

<!-- solodex:diagnostics:start -->
````json
{ …IssueDiagnostics… }
````
<!-- solodex:diagnostics:end -->

</details>
<!-- solodex:report v1 <id> -->
```

`<id>` = `YYYYMMDD-HHmmss-<8 base36>`: the folder name on the reporter's
machine, the folder in the attachments repo (`issues/<yyyy>/<id>/`) and the
idempotency key (`report.json` marker in that folder holds `{number, url}`).

### Diagnostics (`solodex-report/1`)

```jsonc
{
  "schema": "solodex-report/1", "reportId": "…", "createdAt": "…", "receivedAt": "…",
  "source": "button | shortcut | menu | error-boundary | import",
  "app":     { "version": "1.8.16", "packaged": true },
  "runtime": { "electron", "chrome", "node", "platform", "arch", "osRelease", "locale" },
  "window":  { "width", "height", "scaleFactor", "maximized" },
  "state":   { "view": "damage", "game": "Platinum", "species": "Garchomp", "trainer": null },
  "settings": { "showBulk": true, … },              // whitelisted booleans only
  "recentErrors": [ { "at", "source": "renderer|console", "message", "stack" } ],   // ≤ 10, home dir redacted
  "attachments": [ { "kind": "screenshot|image|text", "name", "mime", "bytes", "url" } ]
}
```

Nothing identifying is collected: no username, no paths (the home directory
is replaced with `<home>` in stack traces), no settings values beyond the
whitelist. The form tells the reporter the report is public.

### Comment markers

First line of a comment, invisible on GitHub. Consumers only trust comments
by `Scotts-Thoughts` (`DEVELOPER_LOGIN`), so a stranger cannot make the app
display a fake note. Latest of each kind wins.

| Marker | Written by | Shown to |
|---|---|---|
| `<!-- solodex:fix -->` | `/issues` | developer (Issues panel, Developer Mode) |
| `<!-- solodex:resolution -->` | `/issues` | reporter ("What was fixed") |
| `<!-- solodex:needs-info -->` | `/issues` | reporter ("The developer needs more information") |
| `<!-- solodex:note -->` | `/issues` | developer |

---

## Relay API

`https://solodex-issues.<subdomain>.workers.dev`, Workers free plan. Every
mutating request carries `X-Solodex-Key` (the constant in
`src/main/issues/config.ts`; it ships inside the app, so it only keeps
drive-by scanners out). The Worker never parses a file body, so a report
costs a few milliseconds of CPU regardless of attachment size.

| Endpoint | Body | Worker does | Response |
|---|---|---|---|
| `PUT /v1/files/<yyyy>/<id>/<name>` | the GitHub Contents-API JSON the app builds: `{"message":"report <id>: <name>","content":"<base64>"}` | key → rate limit → path check (`[A-Za-z0-9._-]`, allowed extensions, year matches id) → `Content-Length ≤ 14 MiB` → forwards the body to `PUT /repos/<ATTACH_REPO>/contents/issues/<yyyy>/<id>/<name>` | GitHub's status; `422 … sha` (file exists) counts as success |
| `POST /v1/issues` | `{ reportId, title, description, diagnostics, screenshot?: {url,width,height}, attachments: [{name,mime,bytes,url}] }` ≤ 64 KiB | validates (title ≤ 120, description ≤ 10 000, ≤ 5 attachments, diagnostics ≤ 32 KiB, **every URL must be the report's own attachment URL**), checks the `report.json` marker, builds the body, creates the issue with `status:open` + `from:app`, writes the marker | `201 {ok, number, url, reportId, duplicate:false}` · `200 … duplicate:true` |
| `GET /v1/health` | — | no auth | `{ ok, disabled, limits }` |

Errors: `{ ok:false, error, retryable, retryAfterSeconds?, field?, message? }`
with `error ∈ bad_request · unsupported_type · unauthorized (401) · too_large
(413) · rate_limited (429) · github_error · github_auth · github_rate_limited
(502) · disabled (503) · internal (500)`. The app stops retrying on
`retryable:false` and offers "Export .zip".

Abuse controls: the app key, `[[ratelimits]]` bindings (5/min per IP,
30/min global per colo), size caps before any parsing, the path whitelist,
the URL-prefix check, GitHub's own secondary limits, and the `DISABLED=1`
kill switch (a dashboard variable edit is immediate).

---

## App contract

- **Config**: `src/main/issues/config.ts` — `ISSUES_RELAY_URL` (empty =
  sending disabled; the form says so and reports stay local),
  `ISSUES_APP_KEY`, `ATTACH_REPO`, `ATTACH_BRANCH`. Dev builds honour
  `SOLODEX_RELAY_URL=http://localhost:8787` for `wrangler dev`.
- **Store**: `<userData>/issues/<id>/` = `issue.json` (`IssueRecord`),
  `screenshot.png` (annotated), `screenshot-original.png`, `attachments/…`.
  `%APPDATA%\solodex\issues` on Windows.
- **Submit**: upload the screenshot, then each attachment, then create the
  issue — an issue never appears with missing images; orphaned uploads from
  an aborted submit are harmless.
- **Outbox**: `send` = `pending → sent | failed (retry) | failed-permanent |
  local-only`. Retries 15 s after launch and every 30 min while running, with
  backoff 1 m → 5 m → 30 m → 2 h → 12 h → daily, giving up after 14 days;
  honours `retryAfterSeconds`; checks `/v1/health` once per run.
- **Status read-back**: unauthenticated `GET /repos/…/issues/N` with
  `If-None-Match` (304s do not count against the 60 req/h limit), comments
  fetched only after a 200; unresolved issues only, ≥ 10 min per issue, on
  launch, every 30 min and when the panel opens ("Check for updates" forces
  it); backs off on `x-ratelimit-reset`.
- **Developer Mode** = dev build, or Help ▸ Developer Mode. Adds the "All
  GitHub issues" tab with **Resolved** / **Reopen** (via the logged-in `gh`
  CLI; `settings.ghPath` overrides the binary path) and the technical note.
- **Entry points**: the bug button right of the view tabs; `Ctrl/Cmd+Shift+B`
  (rebindable, "Issues" category in the shortcuts modal); Help ▸ "Report an
  Issue…" / "Issues…"; "Report this problem" on the crash screen.

---

## Working issues

```bash
/issues list              # the queue
/issues                   # work every status:open issue, oldest first
/issues 12 14             # only those
/issues 12 --dry-run      # write the notes, post nothing
/issues 12 --no-commit    # stage only
/issues resolve 12        # close as completed (= Resolved)
/issues reopen 12         # reopen + status:open
```

Per issue the skill runs `npm run issues:fetch -- N` (dumps `meta.json`,
`diagnostics.json`, `comments.md`, downloads `screenshot.png` and
`attachments/`), looks at the screenshot, reproduces and fixes, runs the
verification for the touched area (`CLAUDE.md` rules), posts the two notes
from `.claude/skills/issues/templates/`, relabels, and commits
`"<summary> (#N)"`. Blocked issues become `status:needs-info` (question to
the reporter) or `status:decision` (note to the developer). Reopened issues
(a fix note exists, label back to `status:open`) are worked again after
reading the earlier note.

The same helpers by hand: `npm run issues:list [-- --state all --json]`,
`npm run issues:fetch -- N [--out DIR]`, `npm run issues:labels`,
`npm run issues:import -- <folder-or-zip> [--dry-run]` (files a report a
user exported from the app, using your `gh` token — same paths, same body,
same idempotency marker).

---

## Setup (one-time)

1. *(Recommended)* Create a machine account (e.g. `solodex-bot`), add it as a
   collaborator (Triage on `solodex`, Write on the attachments repo) and mint
   the tokens from it — issues created with **your own** token do not notify
   you. Otherwise `/issues list` is the inbox.
2. `gh repo create Scotts-Thoughts/solodex-issue-attachments --public --add-readme`
3. Two fine-grained PATs (GitHub → Settings → Developer settings), 1-year
   expiry — put a reminder in the calendar:
   - `solodex-relay-issues`: repository `solodex`, **Issues: Read and write**
   - `solodex-relay-attachments`: repository `solodex-issue-attachments`,
     **Contents: Read and write**
   Two tokens because a fine-grained PAT applies one permission set to all
   selected repos; one token would grant Contents:write on `solodex` itself.
4. `npm run issues:labels`
5. `cd relay && npm install && npx wrangler login && npx wrangler deploy`,
   then `npx wrangler secret put GH_TOKEN_ISSUES`, `… GH_TOKEN_ATTACH`,
   `… APP_KEY` (the value of `ISSUES_APP_KEY` in `src/main/issues/config.ts`).
6. Paste the Worker URL into `ISSUES_RELAY_URL` in `src/main/issues/config.ts`
   and release.
7. Add to `.claude/settings.local.json` `permissions.allow` so the skill runs
   without prompts: `Bash(gh issue:*)`, `Bash(gh api:*)`, `Bash(gh label:*)`,
   `Bash(curl:*)`, `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`,
   `Bash(git add:*)`, `Bash(git commit:*)`, `Bash(npm test:*)`, `Bash(npx tsc:*)`.
   Deliberately not `git push` or `npx wrangler` (deploys should prompt).

---

## Operating notes

- **Rotate a PAT** (expired, leaked): mint a new one, `npx wrangler secret
  put GH_TOKEN_…` (deploys immediately), delete the old one on GitHub. No app
  release needed.
- **Disable the relay**: set `DISABLED` to `"1"` in the Cloudflare dashboard
  (Settings → Variables) or in `wrangler.toml` + `npm run relay:deploy`.
  Reports queue in users' apps (503 is retryable) until it is back.
- **Spam**: `gh issue delete N --yes`; if it persists, disable the relay and
  rotate `ISSUES_APP_KEY` with a release.
- **Attachments repo growth**: ~1 MB per report. When it gets large, create a
  fresh repo and point `ATTACH_REPO` at it (both in `wrangler.toml` and
  `src/main/issues/config.ts`); old links keep working. A takedown = delete
  the file (the branch URL dies).
- **Delete a report on request**: `gh issue delete N --yes` and remove its
  folder from the attachments repo.
- **Watching the relay**: `npm run relay:dev` for local runs
  (`relay/.dev.vars` holds local secrets), `cd relay && npm run tail` for
  production logs (one JSON line per request: reportId, issue number, bytes,
  ms, GitHub status — never IPs, titles or text).

---

## Verification

```bash
npm test                                   # includes src/shared, src/main/issues, utils/issues and relay/test
npx tsc -p tsconfig.node.json --noEmit --composite false   # main/preload/shared (one pre-existing mainWindow error)
npx tsc -p tsconfig.web.json --noEmit --composite false    # renderer (pre-existing TS7016 / GameName noise)
cd relay && npm run check                  # tsc against workers-types + wrangler dry-run bundle
npm run relay:dev                          # then: curl http://localhost:8787/v1/health
npm run issues:list                        # the queue, through gh
```

End to end: `npm run dev` with `SOLODEX_RELAY_URL=http://localhost:8787` and
`relay/.dev.vars` holding real tokens → press the bug button → the issue
appears on GitHub with the screenshot rendered → `/issues list` shows it →
`/issues N --dry-run` writes both notes → the app's Issues panel shows "Fix
applied" and the note after `/issues N` relabels it.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| App says "Sending is not set up in this build" | `ISSUES_RELAY_URL` is empty — paste the Worker URL and release |
| Relay answers 401 | `X-Solodex-Key` ≠ the Worker's `APP_KEY` secret |
| `github_auth` (502) in the app's send error | a PAT expired or was revoked — rotate it |
| `github_rate_limited` | GitHub secondary limits (80 content writes/min); reports retry on their own |
| 429 from the relay | rate-limit bindings; per colo, transient |
| Screenshot not rendering in the issue | raw.githubusercontent.com caches ~5 min; or the attachments repo is private (must be public) |
| Error 1102 in `wrangler tail` | CPU limit — should not happen (no body parsing); check for a huge `diagnostics` |
| `/issues list` shows nothing / `--add-label` fails | labels missing → `npm run issues:labels` |
| Developer Mode panel says gh is missing | install GitHub CLI, `gh auth login`; on macOS set `ghPath` in `settings.json` |
| Reopened on GitHub but the skill skips it | the workflow re-adds `status:open`; if it did not run, `gh issue edit N --add-label status:open` |
