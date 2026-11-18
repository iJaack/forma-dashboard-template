# Macro progress verification

`src/app_real.js` provides the display models and configurable targets through the
`__FORMA_TEST__` hook. `src/concepts/ed2.js` renders them on the published main page.

The local unit tests cover capped meters with actual-consumption accessible text,
missing values versus explicit zero, range boundaries, estimates, reduced motion,
responsive CSS rules, configured defaults and fill/track contrast of at least 3:1.
No screenshots or measurement artifacts are needed to run the unit tests.

Build and run the synthetic browser preview:

```sh
npm run build
npm test
node tests/duo-serve.mjs
# Another terminal, with playwright-core and Chrome installed:
node tests/macro-progress-check.mjs
```

Set `CHROME` to another executable if needed. The browser runner blocks requests
outside its loopback origin. It checks five synthetic states at 390, 466, 669 and
1280px in light/dark themes, accessible meter semantics, theme contrast, reduced
motion, entry/update animation and day navigation. It generates fresh evidence in
ignored `output/playwright/macro-progress/`; these artifacts must never be committed.

Use `/?demo=macro-progress&case=under` with `under`, `inrange`, `over`,
`kcal-over-stima`, or `fibre-none`. Only the local preview server interprets this
fixture selector. The deployed Worker has no demo mode or embedded user records.
