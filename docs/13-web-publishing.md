# Web publishing and release checks

The game repository is `superjay0208/crux`. Its project Pages URL is
`https://superjay0208.github.io/crux/`, independent from the portfolio repository.

## Repeatable local setup

Use Node 22 or newer. In `game/`:

```sh
npm ci
npm run campaign:check
npm run check
npm run levels:check
npm run build
npm run web:check
```

On Windows the e2e suite uses installed Microsoft Edge. For Chromium instead:

```sh
npx playwright install chromium
```

Set `CRUX_CI=1` to select Chromium and `CRUX_PRODUCTION=1` to test the built release.
`npm run e2e` uses a private Vite preview on port 5173, which must be free.
`npm run web:check` serves the actual build beneath `/crux/` and tests real first-route input,
demo loading, fonts, saved progression and direct-level navigation. It uses an ephemeral port.

## Publishing

The repository's Pages source must be **GitHub Actions**. The checked-in workflow runs unit,
route, asset, production browser and project-path tests. Only then does it upload `game/dist`
and deploy the Pages artifact. Pushes to main and manual workflow dispatches trigger release.
No app server or account is needed to play. Save progress lives in the player's browser.

`node scripts/publish-github.mjs` reads the current Git credential and reports release status.
`--publish` creates the owner-specific repository if absent, refuses unexpected origins or
non-ancestor history, pushes the committed release and enables workflow publishing if absent.
It does not log/write credentials or force-push. Browser GitHub connection alone does not imply
that local Git has write credentials; authenticate Git separately if needed.

For live smoke testing, from `game/`:

```sh
node scripts/validate-web.mjs --url=https://superjay0208.github.io/crux/
```

The portfolio only needs a link to `/crux/`; keep the game files in the separate repository.
Check live deployment, not just a successful push, before describing a release as published.
