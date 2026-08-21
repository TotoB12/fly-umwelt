# Repository validation

This marker records the first permanent validation run of the canonical self-contained Fly Umwelt 3.3.0 source tree on `main`.

The promoted source was independently checked for:

- all 60 deterministic tests;
- BANC asset integrity and exact audited graph counts;
- JavaScript/WebAssembly compatibility gates;
- a complete static Cloudflare Pages build;
- the 25 MiB per-asset deployment limit;
- absence of temporary bootstrap and promotion files;
- a single permanent GitHub Actions workflow: `.github/workflows/validate.yml`.

The application, whole-CNS data and runtime assets are repository-local and browser-executed.
