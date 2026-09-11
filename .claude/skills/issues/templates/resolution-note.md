<!-- INSTRUCTIONS — do not include this block in the comment.
Audience: the person who reported the bug. They do not know what code is,
and the app shows them this note under "What was fixed".

Rules:
- 2–6 plain sentences. No file names, no code, no identifiers, no version numbers.
- Banned words: null, undefined, state, prop, props, IPC, regression, render,
  component, exception, stack, handler, callback, refactor, edge case, commit.
- Say (1) what was going wrong from their point of view, (2) what changed,
  (3) what they will notice, (4) that it arrives in the next update.
- Do not promise a date. Apologise at most once. Do not claim you reproduced
  the problem unless you did. Do not blame the reporter.
- Keep the first line exactly "<!-- solodex:resolution -->" and the heading.

GOOD:
  When the Mega toggle was switched on for a Pokémon that has no Mega form,
  the damage screen went blank and had to be reopened. The toggle now only
  offers Mega forms that actually exist for the selected Pokémon, and
  switching it no longer clears the screen. This will be included in the next
  update.

BAD (jargon, blames the user, over-promises):
  Fixed a null reference in DamageView when toggling the mega prop; the state
  wasn't reset. Should be in 1.8.17 next week. Sorry for the inconvenience,
  but you shouldn't toggle it for non-mega species anyway.
-->
<!-- solodex:resolution -->
### What was fixed

<plain sentences: what was going wrong, what changed, what you will notice>

This fix will be included in the next update.
