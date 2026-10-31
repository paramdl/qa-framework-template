# QA Framework Template

Reusable Playwright harness so a new client engagement starts at hour zero
instead of day two. Everything is driven by one JSON file, so onboarding a
site is a config change rather than new code.

## Onboard a new site in three commands

```bash
node scripts/new-project.mjs Acme https://acme.com
```
```bash
npm install && npx playwright install chromium
```
```bash
npm run discover -- https://acme.com 3 "Acme"
```

`discover` reads `robots.txt`, walks the sitemap index, buckets URLs by
sitemap section (falling back to route shape for a flat sitemap), samples each
bucket, and writes `config/targets.json`. Then run the suite.

## What it checks

| Suite | `npm run …` | Covers |
|---|---|---|
| Page errors | `smoke` | HTTP status, console errors, uncaught exceptions, failed sub-requests |
| Broken links | `links` | Every in-scope `href`, HEAD with GET fallback, cached per worker |
| Sitemap | `smoke` | Index parses, sections resolve, sampled URLs are alive |
| SEO | `seo` | Title/description length, H1 count, canonical, OG, `lang`, alt, localhost leaks, stray `noindex` |
| Accessibility | `a11y` | axe-core WCAG 2.0/2.1 A+AA; fails on critical/serious only |
| Security headers | `security` | CSP (flags Report-Only), HSTS max-age, XFO/frame-ancestors, nosniff, Referrer-Policy, version leaks |
| Performance | `perf` | Load time and transfer-weight budgets, TTFB, FCP |
| API | `api` | Health, configured endpoints, stack-trace-leak probe |
| Authenticated | `authed` | Per-role suites using saved `storageState` |

`npm run summarize -- "Client"` renders `reports/FINDINGS.md` and
`reports/findings.csv`, grouped by severity and category, retries collapsed.
Observed facts only — no recommended fixes.

## Scaling knobs

| Env var | Effect |
|---|---|
| `PAGE_LIMIT=10` | Cap pages per suite — fast PR runs |
| `PAGE_GROUP=static` | Run one content type only |
| `SITEMAP_SAMPLE=50` | How many sitemap URLs to verify |
| `TARGETS_FILE=config/targets.staging.json` | Swap environments |
| `--shard=1/4` | Split across CI machines |

`.github/workflows/qa.yml` ships a 4-way sharded matrix: PRs run
`PAGE_LIMIT=10`, the nightly cron runs everything.

## Build verification (BVT)

For "does this fresh install actually work" runs, rather than the ongoing SEO/
a11y/security QA sweeps above:

```bash
npm run verify -- "Client - staging" "v1.4.2"
```

`scripts/verify.mjs` runs smoke + `tests/bvt` (guest) + api + every
`authed-<role>` project in sequence (continuing past failures so one broken
suite doesn't hide the rest), then renders one shareable HTML file:
`reports/bvt-report-latest.html` (also timestamped so old runs aren't
overwritten). It is fully self-contained - no external assets - so it's safe
to email or drop in a shared folder; open it and use the browser's
Print -> Save as PDF to export a PDF copy.

**Feature specs live in `tests/bvt/*.spec.ts`** (guest) and
`tests/authed/bvt/*.spec.ts` (per role) - real functional flows (login,
create/edit a record, checkout, etc.), not just "did the page load". Each
install may have different things switched on; declare that in
`config/targets.json`:

```json
"capabilities": {
  "paymentGateway": { "enabled": true, "mode": "test", "note": "Stripe test mode" },
  "smtp": { "enabled": false, "note": "no outgoing mail on this install" }
}
```

and gate a test with `requireCapability('paymentGateway')` at the top of the
test body - a disabled capability shows as a clean **skipped** row in the
report instead of a false failure. `tests/bvt/example.spec.ts` shows the
pattern; delete it once real specs replace it.

Run just the BVT suite without the full campaign: `npm run bvt`. Rebuild the
report from whatever is already in `reports/bvt-results.jsonl`:
`npm run report:build -- "Label" "Version"`. Start a fresh campaign
(clears accumulated results before the next `verify`): `npm run report:reset`.

## Adding a new check area

Drop `tests/<area>/*.spec.ts`. The `guest-chromium` project uses `testIgnore`
rather than `testMatch`, so new folders are picked up with no config edit.
Call `recordFinding({ page, url, severity, category, problems })` and it flows
into the reports automatically.

## Authentication

```
AUTH_ROLES=admin,creator,fan
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
ADMIN_LOGIN_PATH=/admin/login
ADMIN_SUCCESS_PATH=/dashboard
```

The `setup` project logs in once per role and writes `.auth/<role>.json`;
every `authed-<role>` project reuses it. Login cost is paid once per run, not
once per test.

`auth.setup.ts` **asserts the login actually succeeded** before saving state —
a storageState written from a failed login is the most common cause of mystery
authed failures. `tests/authed/session.spec.ts` is the canary: when it fails,
treat every other authed failure that run as noise until it's fixed.

## Tuning noise

`src/utils/page-sweep.ts` has `IGNORED_CONSOLE` and `IGNORED_REQUESTS`. Add
project-specific noise there rather than loosening assertions — that keeps the
signal honest across clients.

## Evidence

Traces, screenshots, and video are retained on failure only. Attach the trace
to a bug report and the dev stops asking for repro steps:

```bash
npx playwright show-trace test-results/<dir>/trace.zip
```
