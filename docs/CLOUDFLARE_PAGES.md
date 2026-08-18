# Cloudflare Pages

## Recommended deployment

Use the full-data build:

```bash
npm run build:full
```

This verifies or installs the pinned reference data before regenerating the static output.

Cloudflare settings:

| Setting | Value |
|---|---|
| Framework | None |
| Build command | `npm run build:full` |
| Output directory | `dist` |
| Root directory | repository root |
| Node | 20+ |

The result is a static site. No Pages Functions, account system, telemetry service or external database is required.

## Local-data build

```bash
npm run build
```

This copies every data file already present in `public/` into `dist/`. In a checkout containing only the bundled fixture, the site starts in verified demo mode. In a checkout with the full pack already vendored, the same command includes it.

## Runtime behavior

All HTML, CSS, JavaScript modules, module Workers, rooms, documentation and connectome files are served from the same static origin. The app does not need a server-side fallback or API.

`_redirects` supplies the static entry-point behavior expected by Pages. `_headers` supplies a restrictive content-security policy, same-origin Worker policy, no-referrer policy, cache rules and disabled device permissions.

## Release check

Before deploying:

```bash
npm run check
npm test
npm run build:full
npm run smoke:strict
```

Run the strict smoke command in an environment where Chromium is permitted to access localhost. Then inspect `dist/` rather than editing it by hand.
