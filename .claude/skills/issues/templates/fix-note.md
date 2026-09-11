<!-- INSTRUCTIONS — do not include this block in the comment.
Audience: the developer. Technical, terse, specific; `path/file.ts:line`
citations welcome. Keep the first line of the comment exactly
"<!-- solodex:fix -->" — the app and the scripts key on it.
If meta.json says reopened, fill in "Previous attempt"; otherwise delete it.
-->
<!-- solodex:fix -->
### Fix note

**Root cause** — what was wrong, where (`src/…/file.ts:line`) and why it happened.

**Change**
- one bullet per meaningful change
- rejected alternatives in one line, if any

**Files**
- `src/renderer/src/components/Example.tsx` — one-line description

**Verification**
- `npx tsc -p tsconfig.web.json --noEmit --composite false` — no new errors (baseline N → N)
- `npm test` — N passing
- Reproduced: yes / no — how (steps, or the test that was added)

**Commit** — `a1b2c3d short subject (#N)` | staged only (`--no-commit`) | not committed: `<file>` was already modified in the working tree

**Follow-ups** — none | bullets

**Previous attempt** — (reopened issues only) which earlier note, why it did not hold, what is different this time
