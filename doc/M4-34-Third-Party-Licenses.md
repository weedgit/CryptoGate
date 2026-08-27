# M4-34 — Third-party & open-source licenses

**Owner:** Kevin (infra). **Implements:** Milestone M4-34.  
**Regenerate:** `node scripts/licenses-report.mjs` after `pnpm install` (from repo root).

Phase 1 npm dependencies for the monorepo (API, watcher, web, payment-page, packages).  
**Cashier APK** (Gradle) and **managed cloud services** are listed separately — not generated from this script.

**Generated:** 2026-08-27 · **Packages:** 90

---

## 1. License summary (npm)

| License | Package count |
| --- | --- |
| MIT | 79 |
| ISC | 7 |
| Apache-2.0 | 2 |
| CC-BY-4.0 | 1 |
| BSD-3-Clause | 1 |

All listed npm packages are permissive (MIT, ISC, Apache-2.0, BSD-3-Clause) except **caniuse-lite** (CC-BY-4.0, dev/build tooling only). Review any **copyleft** license before adding new dependencies (Phase 1 policy: avoid GPL in production bundles).

---

## 2. External services (not npm)

| Service | Role | License / terms |
| --- | --- | --- |
| PostgreSQL 16 | Database (Docker local; managed in prod) | [PostgreSQL License](https://www.postgresql.org/about/licence/) |
| TronGrid / Tron RPC | Chain ingest (watcher) | Provider ToS — Company A account |
| Node.js ≥ 20 | Runtime | MIT |
| pnpm 9.15 | Package manager | MIT |

Company A cloud (Postgres host, TLS, secrets manager, bastion) follows provider agreements — see [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md).

---

## 3. Cashier APK (Android)

Gradle dependencies for `apps/cashier-apk` are **not** included in the table below until the release build.gradle is locked (Bruce — M4-23). Before pilot, run the Android Gradle license report and append to this doc or `doc/Cashier-Apk.md`.

---

## 4. Full npm dependency list

| Package | Version | License | Homepage |
| --- | --- | --- | --- |
| @babel/code-frame | 7.29.7 | MIT | [link](https://babel.dev/docs/en/next/babel-code-frame) |
| @babel/compat-data | 7.29.7 | MIT | [link](https://github.com/babel/babel#readme) |
| @babel/core | 7.29.7 | MIT | [link](https://babel.dev/docs/en/next/babel-core) |
| @babel/generator | 7.29.8 | MIT | [link](https://babel.dev/docs/en/next/babel-generator) |
| @babel/helper-compilation-targets | 7.29.7 | MIT | [link](https://github.com/babel/babel#readme) |
| @babel/helper-globals | 7.29.7 | MIT | [link](https://github.com/babel/babel#readme) |
| @babel/helper-module-imports | 7.29.7 | MIT | [link](https://babel.dev/docs/en/next/babel-helper-module-imports) |
| @babel/helper-module-transforms | 7.29.7 | MIT | [link](https://babel.dev/docs/en/next/babel-helper-module-transforms) |
| @babel/helper-plugin-utils | 7.29.7 | MIT | [link](https://babel.dev/docs/en/next/babel-helper-plugin-utils) |
| @babel/helper-string-parser | 7.29.7 | MIT | [link](https://babel.dev/docs/en/next/babel-helper-string-parser) |
| @babel/helper-validator-identifier | 7.29.7 | MIT | [link](https://github.com/babel/babel#readme) |
| @babel/helper-validator-option | 7.29.7 | MIT | [link](https://github.com/babel/babel#readme) |
| @babel/helpers | 7.29.7 | MIT | [link](https://babel.dev/docs/en/next/babel-helpers) |
| @babel/parser | 7.29.8 | MIT | [link](https://babel.dev/docs/en/next/babel-parser) |
| @babel/plugin-transform-react-jsx-self | 7.29.7 | MIT | [link](https://babel.dev/docs/en/next/babel-plugin-transform-react-jsx-self) |
| @babel/plugin-transform-react-jsx-source | 7.29.7 | MIT | [link](https://babel.dev/docs/en/next/babel-plugin-transform-react-jsx-source) |
| @babel/template | 7.29.7 | MIT | [link](https://babel.dev/docs/en/next/babel-template) |
| @babel/traverse | 7.29.8 | MIT | [link](https://babel.dev/docs/en/next/babel-traverse) |
| @babel/types | 7.29.8 | MIT | [link](https://babel.dev/docs/en/next/babel-types) |
| @esbuild/linux-x64 | 0.21.5 | MIT | [link](https://github.com/evanw/esbuild#readme) |
| @jridgewell/gen-mapping | 0.3.13 | MIT | [link](https://github.com/jridgewell/sourcemaps/tree/main/packages/gen-mapping) |
| @jridgewell/remapping | 2.3.5 | MIT | [link](https://github.com/jridgewell/sourcemaps/tree/main/packages/remapping) |
| @jridgewell/resolve-uri | 3.1.2 | MIT | [link](https://github.com/jridgewell/resolve-uri#readme) |
| @jridgewell/sourcemap-codec | 1.5.5 | MIT | [link](https://github.com/jridgewell/sourcemaps/tree/main/packages/sourcemap-codec) |
| @jridgewell/trace-mapping | 0.3.31 | MIT | [link](https://github.com/jridgewell/sourcemaps/tree/main/packages/trace-mapping) |
| @napi-rs/lzma-linux-x64-gnu | 1.5.1 | MIT | [link](https://github.com/Brooooooklyn/lzma#readme) |
| @noble/curves | 2.3.0 | MIT | [link](https://paulmillr.com/noble/) |
| @noble/hashes | 2.3.0 | MIT | [link](https://paulmillr.com/noble/) |
| @remix-run/router | 1.23.4 | MIT | [link](https://github.com/remix-run/react-router#readme) |
| @rolldown/pluginutils | 1.0.0-beta.27 | MIT | [link](https://github.com/rolldown/rolldown#readme) |
| @rollup/rollup-linux-x64-gnu | 4.62.5 | MIT | [link](https://rollupjs.org/) |
| @rollup/rollup-linux-x64-musl | 4.62.5 | MIT | [link](https://rollupjs.org/) |
| @scure/base | 2.3.0 | MIT | [link](https://paulmillr.com/noble/#scure) |
| @scure/bip32 | 2.3.0 | MIT | [link](https://paulmillr.com/noble/#scure) |
| @types/babel__core | 7.20.5 | MIT | [link](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/babel__core) |
| @types/babel__generator | 7.27.0 | MIT | [link](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/babel__generator) |
| @types/babel__template | 7.4.4 | MIT | [link](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/babel__template) |
| @types/babel__traverse | 7.28.0 | MIT | [link](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/babel__traverse) |
| @types/estree | 1.0.9 | MIT | [link](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/estree) |
| @types/prop-types | 15.7.15 | MIT | [link](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/prop-types) |
| @types/react | 18.3.31 | MIT | [link](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react) |
| @types/react-dom | 18.3.7 | MIT | [link](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom) |
| @vitejs/plugin-react | 4.7.0 | MIT | [link](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#readme) |
| baseline-browser-mapping | 2.11.19 | Apache-2.0 | [link](https://github.com/web-platform-dx/baseline-browser-mapping#readme) |
| browserslist | 4.28.8 | MIT | [link](https://github.com/browserslist/browserslist#readme) |
| caniuse-lite | 1.0.30001809 | CC-BY-4.0 | [link](https://github.com/browserslist/caniuse-lite#readme) |
| convert-source-map | 2.0.0 | MIT | [link](https://github.com/thlorenz/convert-source-map) |
| csstype | 3.2.3 | MIT | [link](https://github.com/frenic/csstype#readme) |
| debug | 4.4.3 | MIT | [link](https://github.com/debug-js/debug#readme) |
| electron-to-chromium | 1.5.413 | ISC | [link](https://github.com/Kilian/electron-to-chromium#readme) |
| esbuild | 0.21.5 | MIT | [link](https://github.com/evanw/esbuild#readme) |
| escalade | 3.2.0 | MIT | [link](https://github.com/lukeed/escalade#readme) |
| gensync | 1.0.0-beta.2 | MIT | [link](https://github.com/loganfsmyth/gensync) |
| js-tokens | 4.0.0 | MIT | [link](https://github.com/lydell/js-tokens#readme) |
| jsesc | 3.1.0 | MIT | [link](https://mths.be/jsesc) |
| json5 | 2.2.3 | MIT | [link](http://json5.org/) |
| loose-envify | 1.4.0 | MIT | [link](https://github.com/zertosh/loose-envify) |
| lru-cache | 5.1.1 | ISC | [link](https://github.com/isaacs/node-lru-cache#readme) |
| ms | 2.1.3 | MIT | [link](https://github.com/vercel/ms#readme) |
| nanoid | 3.3.18 | MIT | [link](https://github.com/ai/nanoid#readme) |
| node-releases | 2.0.53 | MIT | [link](https://github.com/chicoxyzzy/node-releases#readme) |
| pg | 8.23.0 | MIT | [link](https://github.com/brianc/node-postgres) |
| pg-cloudflare | 1.4.0 | MIT | [link](https://github.com/brianc/node-postgres#readme) |
| pg-connection-string | 2.14.0 | MIT | [link](https://github.com/brianc/node-postgres/tree/master/packages/pg-connection-string) |
| pg-int8 | 1.0.1 | ISC | [link](https://github.com/charmander/pg-int8#readme) |
| pg-pool | 3.14.0 | MIT | [link](https://github.com/brianc/node-postgres/tree/master/packages/pg-pool#readme) |
| pg-protocol | 1.16.0 | MIT | [link](https://github.com/brianc/node-postgres#readme) |
| pg-types | 2.2.0 | MIT | [link](https://github.com/brianc/node-pg-types) |
| pgpass | 1.0.5 | MIT | [link](https://github.com/hoegaarden/pgpass#readme) |
| picocolors | 1.1.1 | ISC | [link](https://github.com/alexeyraspopov/picocolors#readme) |
| postcss | 8.5.26 | MIT | [link](https://postcss.org/) |
| postgres-array | 2.0.0 | MIT | [link](https://github.com/bendrucker/postgres-array#readme) |
| postgres-bytea | 1.0.1 | MIT | [link](https://github.com/bendrucker/postgres-bytea#readme) |
| postgres-date | 1.0.7 | MIT | [link](https://github.com/bendrucker/postgres-date#readme) |
| postgres-interval | 1.2.0 | MIT | [link](https://github.com/bendrucker/postgres-interval#readme) |
| react | 18.3.1 | MIT | [link](https://reactjs.org/) |
| react-dom | 18.3.1 | MIT | [link](https://reactjs.org/) |
| react-refresh | 0.17.0 | MIT | [link](https://react.dev/) |
| react-router | 6.30.6 | MIT | [link](https://github.com/remix-run/react-router#readme) |
| react-router-dom | 6.30.6 | MIT | [link](https://github.com/remix-run/react-router#readme) |
| rollup | 4.62.5 | MIT | [link](https://rollupjs.org/) |
| scheduler | 0.23.2 | MIT | [link](https://reactjs.org/) |
| semver | 6.3.1 | ISC | [link](https://github.com/npm/node-semver#readme) |
| source-map-js | 1.2.1 | BSD-3-Clause | [link](https://github.com/7rulnik/source-map-js) |
| split2 | 4.2.0 | ISC | [link](https://github.com/mcollina/split2#readme) |
| typescript | 5.9.3 | Apache-2.0 | [link](https://www.typescriptlang.org/) |
| update-browserslist-db | 1.3.1 | MIT | [link](https://github.com/browserslist/update-db#readme) |
| vite | 5.4.21 | MIT | [link](https://vite.dev) |
| xtend | 4.0.2 | MIT | [link](https://github.com/Raynos/xtend) |
| yallist | 3.1.1 | ISC | [link](https://github.com/isaacs/yallist#readme) |

---

## Related

- CVE / dependency review: Milestone **M4-T04** — run `pnpm audit` (or Company A scanner) before prod release  
- Deploy ops: [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md)
