# Changelog

All notable changes to LagosFile are documented here.
Versions follow [Semantic Versioning](https://semver.org/).
Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

## [1.3.0](https://github.com/bolorundurovj/LagosFile/compare/v1.2.0...v1.3.0) (2026-11-23)


### Features

* add a tax calculator ([e0db7e3](https://github.com/bolorundurovj/LagosFile/commit/e0db7e32ced2200c3ede457e46be9d951a5b4996))
* add configurable caps for pension, NHIS and NHF ([0b939cd](https://github.com/bolorundurovj/LagosFile/commit/0b939cd0da4b93846a4ddd11929ec800d6599c93))
* add custom Windows installer using PolyInstall ([8566b1c](https://github.com/bolorundurovj/LagosFile/commit/8566b1c59707693a4eee1d206f3d74a4b8fb7fc6))
* add deadline notifications and a calendar export ([83f14e1](https://github.com/bolorundurovj/LagosFile/commit/83f14e158f63125aef34028e83fd49d2ebd37817))
* add offline help and guides ([0d491b7](https://github.com/bolorundurovj/LagosFile/commit/0d491b7f1f959c089002625e35ef787f90d49421))
* **db:** add migrations for relief descriptions and payment details ([f4bd176](https://github.com/bolorundurovj/LagosFile/commit/f4bd176cdbd5427d6e21d5e96a857918377607aa))
* enable capital allowance carryforward and prior-year WDV loading ([83c358e](https://github.com/bolorundurovj/LagosFile/commit/83c358ec9ae392c31defa4d6c9c385b08d89ed6f))
* **export:** add a print option to the export dialog ([082b453](https://github.com/bolorundurovj/LagosFile/commit/082b453850c0fc91a886e77f99d6eb615c3e605a))
* implement update checking functionality and UI notification ([36c7392](https://github.com/bolorundurovj/LagosFile/commit/36c73929dd5e60a9dc2a6561baf51530c7768988))
* record tax payments against filings ([d6b6f02](https://github.com/bolorundurovj/LagosFile/commit/d6b6f02cad10e6eefc4f15af34af2c6f80b700a8))
* **review:** compare the filing with the previous year ([6cdf0fb](https://github.com/bolorundurovj/LagosFile/commit/6cdf0fb9f680f592c00b00abee9d3afe51909b3b))
* **security:** lock the app after a period of inactivity ([fcd663f](https://github.com/bolorundurovj/LagosFile/commit/fcd663fc93d332996e39c5338f7ae537679b9c08))


### Bug Fixes

* address SonarCloud reliability and maintainability issues ([680b0d9](https://github.com/bolorundurovj/LagosFile/commit/680b0d978c7d753ad164c3cc0f1be045fc54c069))
* **auth:** make PIN change/reset atomic with keyring sync and recovery gate ([407430e](https://github.com/bolorundurovj/LagosFile/commit/407430eb59886329d4babaca1387c41844efbe57))
* **auth:** refuse to overwrite existing vault ([f96a8ea](https://github.com/bolorundurovj/LagosFile/commit/f96a8eaef34689d403c6fb1de04e82c91f7dc55f))
* **auth:** tie idle lock lifecycle to vault state instead of shell ([f13cc71](https://github.com/bolorundurovj/LagosFile/commit/f13cc711b1cf1cbf198f276cf55e018d243152a7))
* **config:** pin each filing to its tax_config_id and require unique labels ([1e2a26f](https://github.com/bolorundurovj/LagosFile/commit/1e2a26f1ff3a39c2154eeeb253706eeb7a62795f))
* **config:** validate bands transactionally on save and fix JSON export and import ([88bba49](https://github.com/bolorundurovj/LagosFile/commit/88bba49451cb8aebe6c93a4130b4d62c1a9031af))
* **deps:** patch Rust security advisories ([087eb36](https://github.com/bolorundurovj/LagosFile/commit/087eb3627507543121818ce6ab23d8dbb3204bd1))
* **documents:** support removing attachments, clean up files safely, sweep orphans, and set parent_filing_id ON DELETE SET NULL ([f42cc88](https://github.com/bolorundurovj/LagosFile/commit/f42cc88907c6f55f8ce98c8db8537a9fbf124261))
* **export:** fix Unix printing, PDF governed-by label, LIRS bind cleanup, and 400 status text ([cc13b58](https://github.com/bolorundurovj/LagosFile/commit/cc13b586a2786d921eb54b85be32dcd4bf640d8a))
* **export:** include PITA CRA and submitted_at in exports, dynamic act label, harden DCT JPEG and LIRS bridge ([45956f3](https://github.com/bolorundurovj/LagosFile/commit/45956f3a1e3e457b2f34ea4f70a0be93835c6819))
* **export:** RFC 4180 CSV with allowances/reliefs, complete JSON, kobo rounding, paginated PDF appendix, and safe open_file ([a281415](https://github.com/bolorundurovj/LagosFile/commit/a2814159a5970d974d639a64e2bfdba00971bf6c))
* **extension:** add per-session bridge token, fix exact visible autofill, restore Firefox popup, proxy Chrome fetches, and add Vitest suite ([d6514f1](https://github.com/bolorundurovj/LagosFile/commit/d6514f1f0519fe9578975126bfeec44b57061fd9))
* **extension:** capture bridge token at document_start, use session-only storage, distinguish 403, and prioritize tab selectors ([cfbf915](https://github.com/bolorundurovj/LagosFile/commit/cfbf915b0be4861013d1e2ce86b8f119e3481414))
* **extension:** fix token capture race, validate hex token, and guard Firefox sendResponse ([da2ec14](https://github.com/bolorundurovj/LagosFile/commit/da2ec147947fcc49528c0ad2f2ae01a92ee9b396))
* **filing:** copy entries and attachments on amend, validate duplicate years, standardize RFC 3339 timestamps ([4c5abc2](https://github.com/bolorundurovj/LagosFile/commit/4c5abc2a96b24d91122bfdf4a22d35cfa753eb89))
* **filing:** lock filed returns, recompute on confirm, add ref counter and submitted_at ([1cccbeb](https://github.com/bolorundurovj/LagosFile/commit/1cccbebd6e9fa493a6bee91d6786121e218c1bf9))
* **fx:** cache by currency pair and date, persist cache mutations, validate dates, and add timeouts ([f0e870b](https://github.com/bolorundurovj/LagosFile/commit/f0e870ba3e7e0d9d3b61d1dac5ce9765b4f42201))
* handle prerelease versions in the update check ([109b755](https://github.com/bolorundurovj/LagosFile/commit/109b7556c6d309ccc800908a1ef28975a871ed9b))
* **lirs:** distinguish income year from LIRS year of assessment ([2cd5afd](https://github.com/bolorundurovj/LagosFile/commit/2cd5afdd91e5183db76b334eefd529afd4ba86b2))
* **lirs:** fix accommodation, approved/capped deductions, multi-currency foreign income, extra fields, and batch failure reporting ([f177336](https://github.com/bolorundurovj/LagosFile/commit/f17733651da612bb7de36f9c264508994a2318c0))
* **lirs:** harden bridge socket and payload immutability, fix PDF and CSV exports, and skip unrecorded parity rows ([1f2ea9e](https://github.com/bolorundurovj/LagosFile/commit/1f2ea9e492b3152462375c77cabfe43ec70f1bfb))
* **lirs:** lock down bridge, stop on lock, and fix empty batch panic ([6af3941](https://github.com/bolorundurovj/LagosFile/commit/6af394142ba81fc600f7516114af25232d76783e))
* resolve SonarCloud reliability issues ([f55343a](https://github.com/bolorundurovj/LagosFile/commit/f55343a5149f687c1d9e45112b917203ffdb3fd5))
* **rust:** apply the CGT exemption to total disposals and use straight-line allowances ([dc8a174](https://github.com/bolorundurovj/LagosFile/commit/dc8a1746adab686e617c42a170de1fed621f8a12))
* **rust:** fix duplicating a filing and loading prior-year assets ([7afc8b5](https://github.com/bolorundurovj/LagosFile/commit/7afc8b50809851ddcc95a0d8bfcac3fdb5fcf932))
* **security:** encrypt attached documents and bundle them in backups ([c9fc2b0](https://github.com/bolorundurovj/LagosFile/commit/c9fc2b083b9032ee4c1c66e9a380238e414ba046))
* **security:** sanitize attachment paths, enforce entry ownership on deletes, and offload remaining I/O ([5b72c4d](https://github.com/bolorundurovj/LagosFile/commit/5b72c4dc845c9f8bb4011f29027052225b616eeb))
* **tax:** add PAYE and per-entry limited foreign tax credits ([211e492](https://github.com/bolorundurovj/LagosFile/commit/211e4923edeb112890cf6269b6cb18004aa5aad2))
* **tax:** add PITA Consolidated Relief Allowance, fix FTC and CGT edge cases, and harden config validation and migrations ([7a564f3](https://github.com/bolorundurovj/LagosFile/commit/7a564f3d7e7cbfb45dcf1cbab7afb3c6a79a9adf))
* **tax:** preserve PITA config immutability, harden amendments, migrations, and tax validation ([23143b0](https://github.com/bolorundurovj/LagosFile/commit/23143b011c0acc402c922800b3bccd3db7d85a80))
* **tax:** update NTA 2025 rates, add PITA &lt;=2025 config, apply minimum tax before credits ([2cb4a94](https://github.com/bolorundurovj/LagosFile/commit/2cb4a94b17d89c4f3d17c37aee9bcbca8d7ad6b9))
* **tax:** value benefits-in-kind per NTA 2025 s.14 and persist category and cost ([172cf2f](https://github.com/bolorundurovj/LagosFile/commit/172cf2fb6bf7bae7c2b52d804d9e9a75d74eac3f))
* **ui:** fix history pagination, dashboard dedup and deadline banner, and profile/TIN updates ([30733d4](https://github.com/bolorundurovj/LagosFile/commit/30733d4de20fb9dd83b07424cc84391ef3202631))
* **ui:** fix numeric coercion, lock leave guard, migration notices, LIRS warnings, CRA display, and filing config previews ([65f2d57](https://github.com/bolorundurovj/LagosFile/commit/65f2d571555905a3faf88fa4131b9374aa5f8874))
* **ui:** guard concurrent FX lookups, harden restore refresh, and clean up PITA and share-gain state ([d56881b](https://github.com/bolorundurovj/LagosFile/commit/d56881b90a40e0039248afe8c51099f0a9009cf9))
* **ui:** highlight only one sidebar item on /filing/new ([f3a7fab](https://github.com/bolorundurovj/LagosFile/commit/f3a7fab6257c5211d0ae08f2cacdf4f43e33be17))
* **ui:** keep sidebar fixed and allow full page scrolling ([cd51763](https://github.com/bolorundurovj/LagosFile/commit/cd517630532e38355b11886c8b6be8666c306bd3))
* **ui:** use pinned config in income and allowance steps, fix CRA/PITA UX, and reload migration notices on restore ([11010b9](https://github.com/bolorundurovj/LagosFile/commit/11010b9ea6f89cf063b94f0a59f47785776be485))
* update copyright holder name in LICENSE and enable macOS build in release.yml ([5944288](https://github.com/bolorundurovj/LagosFile/commit/5944288a1ec7af4156e906e16707b7df585e2acb))
* **vault:** harden lock atomicity, crash-safe restore recovery, and backup integrity ([4318b6e](https://github.com/bolorundurovj/LagosFile/commit/4318b6ece6df3ff4d8f74a59d181195575ce643f))
* **vault:** increase Windows atomic rename retry budget for transient locks ([8a6da97](https://github.com/bolorundurovj/LagosFile/commit/8a6da978dd23907af33e7dc39bf90e9d785cb233))
* **vault:** prevent cross-process stale overwrites, align restore outcome with journal, and harden doc checks ([162ffa0](https://github.com/bolorundurovj/LagosFile/commit/162ffa0f77a30b631482386391f877efcebdb08e))
* **vault:** retry atomic renames on transient Windows PermissionDenied ([44ce5cb](https://github.com/bolorundurovj/LagosFile/commit/44ce5cb3e64d3b39e0fa0f49083139f4b4969025))
* **vault:** serialize async vault writes, stage atomic restores, and harden unlock and salt checks ([1b85297](https://github.com/bolorundurovj/LagosFile/commit/1b8529750aa4a75fccf4a1be9544825bc75084aa))
* **vault:** use self-describing vault format and portable backup/restore ([774bfa9](https://github.com/bolorundurovj/LagosFile/commit/774bfa935da27b01b8c5cd138a88f66499977876))
* **wizard:** fix WHT total reactivity, zero reliefs, new asset WDV, prior-year dedup, and exempt return confirmation ([9c5a7d6](https://github.com/bolorundurovj/LagosFile/commit/9c5a7d6577eecaa005330e93b4068a54558c00a0))
* **wizard:** recalculate foreign amounts and tax share gains on cgt_gain ([46b9540](https://github.com/bolorundurovj/LagosFile/commit/46b954022e651f11e80cfe8ad3a0fcc852277811))
* **wizard:** save attachments and deleted entries in the filing steps ([18b3ab9](https://github.com/bolorundurovj/LagosFile/commit/18b3ab9ca27ee7896983b0936ec314962e1efffb))
* **wizard:** save dirty steps on navigation, add leave guard, surface errors, remove dead post-confirm view ([8ec9d46](https://github.com/bolorundurovj/LagosFile/commit/8ec9d46f42994a72e4d083fb83afa052b40fe3c4))


### Performance

* **backend:** offload PBKDF2, vault writes, and PDF rendering to spawn_blocking, embed JPEGs via DCT, and add SQLite indexes ([3f070b0](https://github.com/bolorundurovj/LagosFile/commit/3f070b03a4fe94b12f8847f91ab89dc85cecdb14))
* **wizard:** batch step upserts and deletes into one transaction and single vault save ([307bf33](https://github.com/bolorundurovj/LagosFile/commit/307bf33f5a2e8bd7b990deb3f165d6e600973c5d))

## [1.1.1] - 2026-05-31

### Bug Fixes

- Release Versioning ([`76d7ddc`](https://github.com/bolorundurovj/LagosFile/commit/76d7ddcc249ce370536c3e56c419d35a053580e5))



## [1.1.0] - 2026-05-30

### Bug Fixes

- **ci:** Use RELEASE_TOKEN PAT for tag push to trigger release workflow ([`ef4904e`](https://github.com/bolorundurovj/LagosFile/commit/ef4904e8bff3e459d595284b7aa257916beb0db4))


- **ci:** Resolve all 3 pipeline failures ([`0c23767`](https://github.com/bolorundurovj/LagosFile/commit/0c23767bef7de43bb73a6831622f9c6122e06835))


- **ci:** Resolve all remaining clippy and test failures ([`f327cf6`](https://github.com/bolorundurovj/LagosFile/commit/f327cf66fe38d97cdf75032bc33fb1856143eee9))


- **rust:** Remove needless borrow on naira() call in export.rs ([`d4acf94`](https://github.com/bolorundurovj/LagosFile/commit/d4acf94cb76036c9e6a87048aa772a02ee1c61b3))


- **rust:** Remove needless borrow on naira() call in export.rs ([`26dbba8`](https://github.com/bolorundurovj/LagosFile/commit/26dbba8c65204495a16b979cd4dc53ae331355ce))


- **ui:** Move toast outlet to app root for correct fixed positioning ([`19543d1`](https://github.com/bolorundurovj/LagosFile/commit/19543d1dd39190a839bab1c35de55c1db50d9b08))


- **rust:** Correct Cargo version from 2.0.0 to 1.0.0 ([`6c8d485`](https://github.com/bolorundurovj/LagosFile/commit/6c8d4855444dabc829c2d90dc83e6d19a92ae9bf))


- **ui:** Rewrite filing history with imperative state, fix action button alignment ([`7f71b84`](https://github.com/bolorundurovj/LagosFile/commit/7f71b8461979df7e0119c9a69f38add80822d048))


- **brand:** Correct SVG viewBox to 200x84 and update LogoMark aspect ratio ([`c44b654`](https://github.com/bolorundurovj/LagosFile/commit/c44b654fcb17850de13d6100da696cfa7e17ab11))


- **brand:** Add missing closing svg tag in mark-tile.svg ([`d944e4d`](https://github.com/bolorundurovj/LagosFile/commit/d944e4deabd95a089dead3c4977e185d07251db4))


- **extension:** Add proxy fetch logic and enhance Firefox MV2 compatibility ([`991369c`](https://github.com/bolorundurovj/LagosFile/commit/991369cf68c4f27d3d7eb62d91472d18d075267f))


- **deps:** Regenerate package-lock.json to sync with license-checker addition ([`f81ef3c`](https://github.com/bolorundurovj/LagosFile/commit/f81ef3c221855cf14b28d1926ff96a2f48dc8c7b))


- **ci:** Bust stale rust-cache; add cache-on-failure and explicit key ([`950a43a`](https://github.com/bolorundurovj/LagosFile/commit/950a43a836a340f8092691c64571461c58fb5cfc))


- **deps:** Regenerate package-lock.json to sync with latest dependencies ([`25edf17`](https://github.com/bolorundurovj/LagosFile/commit/25edf17fecb578820c1f6b71f65253e334d64187))


- **ci:** Bust rust-cache key to v3 and remove cache-on-failure ([`9f5d2bb`](https://github.com/bolorundurovj/LagosFile/commit/9f5d2bb278de423ba93d842250e7d670a1afdffa))


- **frontend:** Use  param in HostListener to satisfy Angular v21 strict checks ([`bccb4d2`](https://github.com/bolorundurovj/LagosFile/commit/bccb4d2f6cfbb83c7811aaa2c8da0512c0389c57))


- **rust:** Move printpdf, image, lopdf out of windows-only deps section ([`67c6d47`](https://github.com/bolorundurovj/LagosFile/commit/67c6d47a4402a07dbb597a4a85554af999abd159))


- Release Versioning ([`1e1f3c4`](https://github.com/bolorundurovj/LagosFile/commit/1e1f3c43fa8b85b0161aedd1a8ac33182139fa0b))



### Documentation

- **extension:** Add extension README with install guide and usage screenshots ([`03893aa`](https://github.com/bolorundurovj/LagosFile/commit/03893aac6e5e73779af3f27da6949d30a8f87ae6))


- **readme:** Add release, CI, SonarCloud, license and stars badges ([`d8ac968`](https://github.com/bolorundurovj/LagosFile/commit/d8ac968321d7c686029228f2c8e019608d401e20))


- **readme:** Replace static screenshots with interactive accordion showcase ([`3bddeea`](https://github.com/bolorundurovj/LagosFile/commit/3bddeeab57133379460ab123b267991d903d6283))


- **github:** Add structured bug report and feature request issue templates ([`ea1be81`](https://github.com/bolorundurovj/LagosFile/commit/ea1be816539feb456797678712e3642738d3de88))



### Features

- **brand:** Add logo mark SVG assets and LogoMark/ArchLoader components ([`98efa09`](https://github.com/bolorundurovj/LagosFile/commit/98efa09922fd5eda5f08d1a98da7c74bcdec89dd))


- **splash:** Inline splash in index.html, drop separate Tauri splash window ([`e959807`](https://github.com/bolorundurovj/LagosFile/commit/e9598076e444753317fa2a0d5338af401f58da55))


- **ui:** Replace LF monogram with logo mark, add encrypted tagline to auth screens ([`915ff06`](https://github.com/bolorundurovj/LagosFile/commit/915ff0686c55855923d0ec874d9d35694235a703))


- **extension:** Rebrand popup and content-script with logo mark and brand colours ([`77435c3`](https://github.com/bolorundurovj/LagosFile/commit/77435c3056f48e655a1ec22d7f1a0f4e7c839a1c))


- **filing:** Restrict new filings to past years only, add duplicate check ([`f8c3b87`](https://github.com/bolorundurovj/LagosFile/commit/f8c3b87596e71596c92e34cad3be25639b9df65e))


- **ui:** Add theme cycle switcher and calendar icon to topbar ([`9bac171`](https://github.com/bolorundurovj/LagosFile/commit/9bac17135eef2fcd03aa33a2863c066e31db288d))


- **settings:** Derive version from package.json, add live changelog modal and update check ([`cbccc2b`](https://github.com/bolorundurovj/LagosFile/commit/cbccc2bfd8a3838ee33e52ed82150f3dbdb7d588))


- **auth:** Add biometric authentication backend with keyring and Windows Hello support ([`e13ed02`](https://github.com/bolorundurovj/LagosFile/commit/e13ed02573f2f9b1ed93768dd7d0b285c19f4df0))


- **ui:** Add biometric unlock button and settings toggle, improve lock() error handling ([`b38e839`](https://github.com/bolorundurovj/LagosFile/commit/b38e839f40cb7888df941aeea407d16a0937299e))


- **export:** Add branded cover page with SVG letterhead and alt-fills style selector ([`2bd4bbe`](https://github.com/bolorundurovj/LagosFile/commit/2bd4bbeeaded4b405c44fb8fa243c58faf8f0c88))



### Miscellaneous

- **ci:** Disable macOS (Intel) build configuration ([`dfd3352`](https://github.com/bolorundurovj/LagosFile/commit/dfd33520d07cd6fc73b88c48627ca79a9516dfcf))


- Clean up code and add linting scripts ([`b68cfc8`](https://github.com/bolorundurovj/LagosFile/commit/b68cfc8be5b547c4a665586e25d78c1ef3436ed3))


- Setup Makefile, husky pre-push hooks, and CI linting ([`3d09f82`](https://github.com/bolorundurovj/LagosFile/commit/3d09f82c2a8cc12aadb2c85befe69ee1943001d8))


- **brand:** Replace all extension and Tauri app icons with new branded assets ([`205e886`](https://github.com/bolorundurovj/LagosFile/commit/205e886019c89ec6d3fcfd70421cf2b12d854c79))


- Remove commented-out code and clean up SCSS and JS files ([`dc23339`](https://github.com/bolorundurovj/LagosFile/commit/dc233396a08e914bd943d94993d8266663948b5e))


- Bump minor version to 1.1.0 ([`1ef8d41`](https://github.com/bolorundurovj/LagosFile/commit/1ef8d41f902af1d59925138812cf663331a8bacf))


- Upgrade Angular dependencies to version 20 and update build configurations ([`d1f985a`](https://github.com/bolorundurovj/LagosFile/commit/d1f985ab7533085b0c1870651257e686c3203b74))


- Upgrade Angular dependencies to version 21 and update tsconfig ([`6af17d9`](https://github.com/bolorundurovj/LagosFile/commit/6af17d9a37bba3e662e805ba241f3cb97b50c60c))


- Update package-lock.json after Angular v21 upgrade ([`cbd1490`](https://github.com/bolorundurovj/LagosFile/commit/cbd14908d8ddfb0d1a49c87fcd9c3272c6f7126b))



### Refactoring

- **rust:** Extract business logic from commands into dedicated services ([`8518b80`](https://github.com/bolorundurovj/LagosFile/commit/8518b8096661f405bfae7c60498e3a280b077568))



### Testing

- **rust:** Add unit tests for computation, config, db, filing, fx, profile and security services ([`030da3d`](https://github.com/bolorundurovj/LagosFile/commit/030da3d7ffddea21132eda6e3629d3f31c003d1d))


- **angular:** Add unit tests for auth, config, document, filing, profile and theme services ([`a714f2f`](https://github.com/bolorundurovj/LagosFile/commit/a714f2f267b3bf362ca5a1ac2adededa141fa732))



## [1.0.0] - 2026-05-27

### Bug Fixes

- Align TaxCalculator with spec TaxConfig dataclass signature ([`96eee3b`](https://github.com/bolorundurovj/LagosFile/commit/96eee3bfce8453d7a1e6193445910391c26cb455))


- Use update_or_create in FXService._cache_rate to handle duplicate cache entries ([`4e024a7`](https://github.com/bolorundurovj/LagosFile/commit/4e024a79e80fb64d715d9c0290ab2370c027b88f))


- Add deadline=None to document size property test to handle large file writes ([`6bd0585`](https://github.com/bolorundurovj/LagosFile/commit/6bd0585a7b79a00f2d9c502b35751cb5f3e590d1))


- Update LIRS e-Tax Portal URL to correct domain ([`d259fc4`](https://github.com/bolorundurovj/LagosFile/commit/d259fc4e29b96af0259de4061195294a451c0ece))


- Repair truncated pin-recovery component ([`7a167c0`](https://github.com/bolorundurovj/LagosFile/commit/7a167c0796bd5448c0d7a1d4b66e6b53b5564e91))



### Documentation

- Add design notes, requirements, and NTA 2025 reference ([`083b8a0`](https://github.com/bolorundurovj/LagosFile/commit/083b8a0781053f761976bc08dbc170952fdfef3c))


- Add contributing guide, security policy, architecture overview, and rewrite README ([`3253226`](https://github.com/bolorundurovj/LagosFile/commit/3253226c4f999eb56301fb4ba659e3f0df9947c0))



### Features

- **test:** Implement profile persistence tests ([`07c1d0f`](https://github.com/bolorundurovj/LagosFile/commit/07c1d0f4d7e0514135cb8992e13aa695cdb20a5b))


- **project:** Initial lagosfile implementation ([`7679f7d`](https://github.com/bolorundurovj/LagosFile/commit/7679f7d7a0163d1a27205062c44660c8241ba5c5))


- Scaffold project structure and dependencies ([`018b621`](https://github.com/bolorundurovj/LagosFile/commit/018b6217c1e3789b3d365907a9d07b8ff533f1b6))


- Implement PIN-keyed Fernet encryption module ([`2e11b4c`](https://github.com/bolorundurovj/LagosFile/commit/2e11b4cddfede9d2156c300d153039f72ac89866))


- Implement TortoiseORM models with init_db and serialize_db ([`274840a`](https://github.com/bolorundurovj/LagosFile/commit/274840abfbbd05218cdecf8c7dbc7091c8658814))


- Implement ConfigEngine with versioned Tax_Config and NTA 2025 seed ([`611b6e3`](https://github.com/bolorundurovj/LagosFile/commit/611b6e38d329aa4273032e023b8d965a262c5191))


- Implement ProfileService with TIN validation and DB encryption ([`e14f32b`](https://github.com/bolorundurovj/LagosFile/commit/e14f32b1786aa0165abb8b7421711eef3fe9de0e))


- Implement FilingService draft lifecycle (create, save, confirm, duplicate, amend) ([`873a09a`](https://github.com/bolorundurovj/LagosFile/commit/873a09a6ab832f02c9b75ca273f0e69998a40f79))


- Implement DocumentService with file size validation and attachment storage ([`669295c`](https://github.com/bolorundurovj/LagosFile/commit/669295ccef23eca3f7746fbd8d27747c5dae78ef))


- Implement FilingService draft lifecycle (create, save, confirm, duplicate, amend) ([`7549c76`](https://github.com/bolorundurovj/LagosFile/commit/7549c7693c82cc42bb62e4d5c90e87b2ef54ad97))


- Implement AppState and WizardDraft state management with step transitions ([`0da5068`](https://github.com/bolorundurovj/LagosFile/commit/0da5068005df864b91928bb79ec46a9e9713f111))


- Implement ComputationEngine core logic with digital asset ring-fencing and CGT exemption ([`f5af0db`](https://github.com/bolorundurovj/LagosFile/commit/f5af0db29541009d3988aae4cee30731e8b32e27))


- Rewrite FXService with correct waterfall resolution, URLs, and FXCache field names ([`864db29`](https://github.com/bolorundurovj/LagosFile/commit/864db2921e6aa4ce90a6021579d9c11c1385baa0))


- Implement CBN override rate logic and add property test (Property 10) ([`10654e3`](https://github.com/bolorundurovj/LagosFile/commit/10654e3ddaf5c42b5d98f4ee33bc951d1db9617f))


- Implement ExportEngine with JSON, CSV, and PDF export ([`507d479`](https://github.com/bolorundurovj/LagosFile/commit/507d4794d33e3b57eccd5cae989802b5a139148a))


- Add list_filings with pagination/filtering and get_filing_detail to FilingService ([`9056760`](https://github.com/bolorundurovj/LagosFile/commit/905676050b1f86b0c8e80960e357910502370ae1))


- Add calculate_bik_taxable_value and property tests for BIK and income entry persistence (Properties 3, 4) ([`188529c`](https://github.com/bolorundurovj/LagosFile/commit/188529cfa442436021283607ae14448c8c9cb1c0))


- Add calculate_annual_allowance, days_until_deadline, and property tests (Properties 12, 26) ([`5beb442`](https://github.com/bolorundurovj/LagosFile/commit/5beb4429a666672e4a424acf1b68ad9d3aab60a3))


- Implement LIRSService with Playwright automation, Reference Panel fallback, and mark_submitted ([`ea9d82c`](https://github.com/bolorundurovj/LagosFile/commit/ea9d82cbe42113c0f280702395a9407d95faa319))


- Implement Flet UI layer — all pages and components (Phase 9) ([`11a8205`](https://github.com/bolorundurovj/LagosFile/commit/11a8205ce28e82ddac10d6a8334bda72138d54c6))


- Add initial database migration setup with Aerich and TortoiseORM ([`51fe0a2`](https://github.com/bolorundurovj/LagosFile/commit/51fe0a2f62c1ccc9a40e0d864cc00c61b9794fec))


- Add flake8 and pre-commit configuration, improve code formatting and consistency ([`b48a2ae`](https://github.com/bolorundurovj/LagosFile/commit/b48a2ae1efc963caad10ae6a92d0e16daacd10df))


- Update .gitignore to include VSCode files, database files, and environment variables ([`b29fa86`](https://github.com/bolorundurovj/LagosFile/commit/b29fa861f960d73f8b21b2d5c361e6e9f70b823e))


- Implement design system (tokens, typography, global styles) ([`6a5eccc`](https://github.com/bolorundurovj/LagosFile/commit/6a5eccc17f72fcc27ea1192ecaef36f4f91e1ccc))


- Implement Rust/Tauri backend — DB, encryption, auth, and tax computation ([`51faa26`](https://github.com/bolorundurovj/LagosFile/commit/51faa2626c5c42b014817c81d878f7dbf1033de0))


- Implement Angular frontend — shell, auth, dashboard, filing wizard, history, config, settings ([`2360ded`](https://github.com/bolorundurovj/LagosFile/commit/2360dedae34b3dc94dec630899702257d7c0e6b8))


- Add PIN recovery via security questions ([`8a6023f`](https://github.com/bolorundurovj/LagosFile/commit/8a6023fe2c955658513975dd50c8c127b292952b))


- Add shared Angular components ([`abe94bc`](https://github.com/bolorundurovj/LagosFile/commit/abe94bca4d6d96debc6f64810df68c19f5e8470c))


- Add year selection step for new filings in filing wizard ([`309ee3a`](https://github.com/bolorundurovj/LagosFile/commit/309ee3aff4c50ce5c103bc1cb7eeeaa46db19df2))


- Implement document attachment and export functionality in filing process ([`7e7f18f`](https://github.com/bolorundurovj/LagosFile/commit/7e7f18f532a671efbace6a064178991a7deb8e03))


- Add numeric formatting directive for improved number input handling ([`d277a5b`](https://github.com/bolorundurovj/LagosFile/commit/d277a5b6a10fa7a0f2e7541cacb542ca30629a37))


- Enhance sidebar navigation with active link highlighting for filing details ([`36beebe`](https://github.com/bolorundurovj/LagosFile/commit/36beebedd15072810c063e1c769e49c8ab2846c3))


- Refactor progress strip to use buttons for improved accessibility and interaction ([`f8b1265`](https://github.com/bolorundurovj/LagosFile/commit/f8b1265a92b34a587ec35602b25542c9255004dc))


- Implement attachment handling in PDF export process with support for images and PDFs ([`95818ca`](https://github.com/bolorundurovj/LagosFile/commit/95818ca6a3b61b40a7c8b9b029433ac8735f7c0d))


- Load documents for income, capital allowance, and relief entries in filing process ([`308fc63`](https://github.com/bolorundurovj/LagosFile/commit/308fc630673a90640279c9130ad15b8fa44af3f7))


- Integrate Lucide icons across components for enhanced UI consistency ([`057d3f6`](https://github.com/bolorundurovj/LagosFile/commit/057d3f609aa056344f50bf1628f41bff0cb4d680))


- Implement theme switching functionality with light, dark, and system options ([`f6a0079`](https://github.com/bolorundurovj/LagosFile/commit/f6a0079996ac1e26fd9b9c579929aceaf36e12da))


- Add HelpTooltip component for enhanced contextual help across configuration and dashboard components ([`77fc332`](https://github.com/bolorundurovj/LagosFile/commit/77fc332f8a406ac2443723951bea8e5db0613be1))


- Add window state plugin and update configuration for improved window management ([`294c260`](https://github.com/bolorundurovj/LagosFile/commit/294c26092bc2e05c005ef5fc09e218c9ffae8561))


- Add ToastComponent and ToastService for improved user notifications ([`43dd667`](https://github.com/bolorundurovj/LagosFile/commit/43dd667ccf323d71aec7b8e798d108dfbcce14fc))


- Implement backup and restore functionality for user data ([`e3dd425`](https://github.com/bolorundurovj/LagosFile/commit/e3dd425801ff5a05b15f58d136191d3ecab5ac24))


- Add change PIN functionality with re-encryption and recovery invalidation ([`ff41562`](https://github.com/bolorundurovj/LagosFile/commit/ff41562807b8feccb95a9611092b0b373b4f5183))


- Add LIRS portal data models (PendingFiling types + Clone, Angular interfaces) ([`d8a376e`](https://github.com/bolorundurovj/LagosFile/commit/d8a376eb2e16daa7c6919b2be91293292fd3f025))


- Implement LIRS local HTTP bridge with multi-filing support ([`18861fc`](https://github.com/bolorundurovj/LagosFile/commit/18861fc4b4915f4563d7d808fe361511c4683875))


- **ext:** Replace popup interaction with Shadow DOM floating panel ([`f9bcee2`](https://github.com/bolorundurovj/LagosFile/commit/f9bcee2ce63b971a48e085e2a2668c06f66624a7))


- **ext:** Add multi-filing popup, manifest, and shared helpers ([`8e72780`](https://github.com/bolorundurovj/LagosFile/commit/8e727803a1ad619de8cea235cd3b5c9c4c1ff186))


- **app:** Add LIRS service, reference panel, and open-all trigger ([`a90feee`](https://github.com/bolorundurovj/LagosFile/commit/a90feee245ccd1936a3236e7c8f5fb6c749655f3))


- Add browser-specific icons for Chrome and Firefox extensions ([`cbc691f`](https://github.com/bolorundurovj/LagosFile/commit/cbc691f5e58490cbe6567e6fbe6aea06c5be7356))



### Miscellaneous

- Remove off-spec test files generated with incorrect field names and non-spec types ([`75e6086`](https://github.com/bolorundurovj/LagosFile/commit/75e608605479f0b5f6362cf1e1f1dc5274ca84a7))


- Update .gitignore ([`ab3b6b9`](https://github.com/bolorundurovj/LagosFile/commit/ab3b6b9f6dc5280193cc78aaa449af9e8e41cbd1))


- Add tzdata dependency for timezone support in poetry venv ([`79d0c50`](https://github.com/bolorundurovj/LagosFile/commit/79d0c50a06fed8b4da0feb9c498efd3083e937e0))


- Scaffold Angular 19 + Tauri 2 project ([`4ab2763`](https://github.com/bolorundurovj/LagosFile/commit/4ab2763f927e1f5c6a7e1430b82413d7c025ffee))


- Add Tauri generated schemas ([`5c5361b`](https://github.com/bolorundurovj/LagosFile/commit/5c5361b24835c65580e4088ed315bde707a0f6c3))


- Ignore scratch files ([`4fa7786`](https://github.com/bolorundurovj/LagosFile/commit/4fa778619fd271e1c4f50cc3e2b0d692d72ff8ac))


- Update gitignore, package.json, add build scripts and docs ([`ccad6e3`](https://github.com/bolorundurovj/LagosFile/commit/ccad6e35cd53bf1bdef95a9d2014477cf474ceec))


- Format manifest.json for consistent indentation and style ([`3e718dc`](https://github.com/bolorundurovj/LagosFile/commit/3e718dce1b60aa5b8061689a7ee580b00c2d91d4))



### Refactoring

- Remove unused package docstrings and clean up .gitignore ([`c13b293`](https://github.com/bolorundurovj/LagosFile/commit/c13b293ab0508e4b1fdc59b005d5457cf63c801e))


- Remove legacy code ([`ba2aee2`](https://github.com/bolorundurovj/LagosFile/commit/ba2aee2338796dae8758ad0c48ac2e2a8921fdc3))



### Testing

- Add property tests for encryption round-trip (Property 25) ([`01dd715`](https://github.com/bolorundurovj/LagosFile/commit/01dd715fb49f384ff15f93e738dcf67b0e26ee84))


- Add property tests for Tax_Config import/export round-trip and invalid import rejection (Properties 23, 24) ([`39d13a5`](https://github.com/bolorundurovj/LagosFile/commit/39d13a5932801817492caa2a61a720be9425fabc))


- Add property test for TIN validation (Property 1) ([`551a5e8`](https://github.com/bolorundurovj/LagosFile/commit/551a5e8c18ef27c97cb123a8c98c0559cdc98428))


- Add property tests for FX waterfall ordering and rate caching (Properties 9, 11) ([`ac4f949`](https://github.com/bolorundurovj/LagosFile/commit/ac4f949ffe7c4d663ad9789d6f1663b45e61d970))


- Add property test for profile persistence round-trip (Property 2) ([`642824f`](https://github.com/bolorundurovj/LagosFile/commit/642824f0f397fa565538fe13f26a7536bfceb771))


- Add property test for document file size enforcement (Property 7) ([`36ed66d`](https://github.com/bolorundurovj/LagosFile/commit/36ed66d57774592d1a47396dc6183910215cc721))


- Add property test for document storage path construction (Property 8) ([`6aac3f4`](https://github.com/bolorundurovj/LagosFile/commit/6aac3f469845c711181103a294cbf5939ed4aa5c))


- Add property tests for filing duplicate YOA, amendment immutability, and reference format (Properties 18, 19, 20) ([`2d4da17`](https://github.com/bolorundurovj/LagosFile/commit/2d4da17e973e123a2fab73ca19125e64c88b0670))


- Add property tests for digital asset loss ring-fencing and CGT exemption (Properties 5, 6) ([`34624a1`](https://github.com/bolorundurovj/LagosFile/commit/34624a102065e85947a06dc157f23b32ad0669e3))


- Add property tests for CA proration, rent relief, tax bands, sequence invariants, and config-driven computation (Properties 13, 14, 15, 16, 17) ([`28108fb`](https://github.com/bolorundurovj/LagosFile/commit/28108fb74790219d6c21b2689b4d3bc211b33d77))


- Rewrite FX waterfall and caching property tests (Properties 9, 11) ([`60b3c17`](https://github.com/bolorundurovj/LagosFile/commit/60b3c174adfcecf4808b6878c75a31eadfda3d32))


- Add property tests for JSON export round-trip and CSV required columns (Properties 21, 22) ([`46b0485`](https://github.com/bolorundurovj/LagosFile/commit/46b0485b5748a6890d11fc181227303a1f8d3e56))
