---
name: build-typecheck
description: How to typecheck the renderer (build uses esbuild, not tsc) and the EBUSY out-dir lock
metadata:
  type: project
---

`npm run build` (`electron-vite build`) compiles with esbuild, which strips types **without typechecking** — type errors do not fail the build. To actually catch type errors, run:

`npx tsc -p tsconfig.web.json --noEmit --composite false`

When reading its output, ignore two classes of **pre-existing** noise (the project never runs tsc, so these have always been there): `TS7016` "could not find declaration file" for every `@data/*.js` import, and a handful of `string` vs `GameName` / `string | null` errors in `App.tsx` (`GAMES.includes(g) ? g : ...` setters) and `TrainerDetail.tsx`.

`npm run build` also often fails at the end with `EBUSY: resource busy or locked, rmdir '...\out\renderer\...'`. This is environmental, not a code problem — the `out/` dir is inside the Dropbox-synced project folder and Dropbox (or a running app/dev instance) holds file handles while vite tries to wipe it. The renderer compile ("155 modules transformed") completing is the real success signal. `npm run dev` is unaffected.
