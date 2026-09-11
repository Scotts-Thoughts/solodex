# solodex-issues relay

Cloudflare Worker that files Solodex in-app bug reports as GitHub issues.
The full design (endpoints, issue format, status model, setup checklist) is
in `docs/issues/README.md`; this file is the operator's quick reference.

```bash
npm install                       # wrangler + workers types
cp .dev.vars.example .dev.vars    # local secrets (gitignored)
npm run dev                       # http://localhost:8787
npm run check                     # tsc + wrangler dry-run bundle
npx wrangler login                # once
npm run deploy                    # creates https://solodex-issues.<subdomain>.workers.dev
npx wrangler secret put GH_TOKEN_ISSUES
npx wrangler secret put GH_TOKEN_ATTACH
npx wrangler secret put APP_KEY   # = ISSUES_APP_KEY in src/main/issues/config.ts
npm run tail                      # production logs
```

Smoke test against a running Worker (`$URL`, `$KEY`):

```bash
curl -s $URL/v1/health
ID=$(date -u +%Y%m%d-%H%M%S)-smoke001
curl -s -X PUT "$URL/v1/files/${ID:0:4}/$ID/screenshot.png" -H "X-Solodex-Key: $KEY" -H 'Content-Type: application/json' \
  -d "{\"message\":\"report $ID: screenshot.png\",\"content\":\"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==\"}"
curl -s -X POST $URL/v1/issues -H "X-Solodex-Key: $KEY" -H 'Content-Type: application/json' -d "{
  \"reportId\": \"$ID\", \"title\": \"smoke test\", \"description\": \"from curl\",
  \"diagnostics\": { \"schema\": \"solodex-report/1\", \"app\": { \"version\": \"0.0.0\" }, \"state\": { \"view\": \"damage\", \"game\": \"Platinum\" } },
  \"screenshot\": { \"url\": \"https://raw.githubusercontent.com/Scotts-Thoughts/solodex-issue-attachments/main/issues/${ID:0:4}/$ID/screenshot.png\", \"width\": 1, \"height\": 1 },
  \"attachments\": [] }"
# → {"ok":true,"number":N,…}; running the POST again → 200 "duplicate":true. Clean up: gh issue delete N --yes
```

Kill switch: set the `DISABLED` variable to `"1"` (dashboard → Settings →
Variables, immediate) or in `wrangler.toml` + deploy. Rotate a token with
`npx wrangler secret put …` — no app release needed.
