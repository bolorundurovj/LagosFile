# Changelog

All notable changes to LagosFile are documented here.
Versions follow [Semantic Versioning](https://semver.org/).
Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

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




