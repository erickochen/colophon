# Colophon

A userscript that rebuilds the MyAnonaMouse interface as a modern tracker UI. It renders a
React app into a shadow root on top of the existing site and keeps the original DOM as a
hidden fallback, so the site's own scripts keep working.

Built with Vite, React 19, Tailwind v4 and shadcn/ui, bundled by vite-plugin-monkey.

The installed userscript is a small loader (about 11 kB). It veils the page at
document-start, reads the app from local storage on the site's own origin and executes it
in page context, downloading a new payload once per version. Everything it reads from that
cache is hashed again before it runs.

## Requirements

- Node 20.19+ or 22.12+
- pnpm
- A userscript manager (Violentmonkey or Tampermonkey)
- An account on the site, since every page it renders is behind login

## Build

```sh
pnpm install
pnpm build
```

The build first generates the color schemes (`gen-schemes.mjs` writes the `.gen` files,
`verify-schemes.mjs` checks them against `schemes/palettes.mjs`), then runs the TypeScript
check and `build.mjs`.

`dist/` gets three files:

- `colophon.user.js`, the loader you install
- `colophon.meta.js`, the light file managers poll for `@version`
- `colophon-<sha16>.payload.js`, the application, named after the SHA-256 of its own bytes

The loader carries the payload URL plus the full hash and checks the hash after
downloading and on every read from local storage. Payload objects from earlier releases
stay on the storage zone, because installs on an older loader still request the older
name. When a download fails, the loader may start one older copy: the release right before
this one. `FALLBACK_PAYLOAD_SHA256` and `PUBLISHED_PAYLOAD_SHA256` in `version.mjs` record
that pair.

`pnpm build:fast` skips the TypeScript check. To point a build at a local server:

```sh
SITE_URL=http://127.0.0.1:8080 BASE_PATH=cf pnpm build:fast
```

## Test

```sh
pnpm test
```

Runs the Node test files in `test/`. A release runs them first.

## Deploy

`pnpm run deploy` runs a full build, uploads `dist/` to the storage zone, waits until
every replication region lists the new files and then purges the CDN so update checks see
the new version. Copy `.env.deploy.example` to `.env.deploy` and fill in credentials plus
target; the file is ignored by git and must stay out of the repository.

`SITE_URL` and `BASE_PATH` become the `@updateURL`, the `@downloadURL` plus the payload
URL the loader downloads from. The build stops without them.

`node upload-assets.mjs <file...>` uploads standalone assets (screenshots) to the zone
without a rebuild.

Note that `pnpm deploy` without `run` is a reserved pnpm command and will not execute the
script.

## Release

```sh
pnpm release            # minor bump
pnpm release patch      # patch or major instead
pnpm release resume     # retry a release that failed after the upload
```

This runs the tests, reads the replication regions off the Bunny Storage Zone, then bumps
the version in `version.mjs`, builds and deploys. The gate is the nearby CDN edge: meta,
loader and payload have to match this build byte for byte, in every compression variant,
before anything is committed or tagged. After that gate a Globalping check reports which
regions still trail; that report never blocks the release.

`BUNNY_API_KEY` is required, since it both purges and lists the regions.
`GLOBALPING_TOKEN` is optional and raises Globalping's hourly allowance.

A failed build rolls the version back. Once an upload has happened the new version stays
in `version.mjs` and `resume` retries that same release with the same bytes. A plain
`pnpm release` refuses to run while a bump is sitting there uncommitted. Pushing is left
to you with `git push --follow-tags`.

## Layout

```
src/
  loader.ts         the installed userscript: veil, cache, payload injection
  main.tsx          bootstrap: shadow root, style injection, page routing
  index.css         theme tokens and base styles
  schemes.gen.css   generated color schemes, written by gen-schemes.mjs
  app/
    router.tsx      maps a site URL to a view
    pages/          one view per page of the site
    shell/          sidebar, topbar, command menu, dialog host
  components/       shared pieces: filters, wizard, composer, book covers
    ui/             shadcn components, portals patched into the shadow root
  hooks/
  lib/              site API clients, DOM extractors, form mirroring, theming
schemes/            canonical palette data for the generated color schemes
test/               Node test files
```

## Implementation notes

The site sends a strict CSP: no external hosts and no `data:` fonts, so the UI relies on
system font stacks and same-origin requests only. All styling is injected into the shadow
root, which keeps the site's own stylesheets from bleeding in.

Pages fall into three groups. Some are rendered from official JSON endpoints, some are
parsed out of the server HTML and some are mirrored forms, where the rebuilt controls
write straight through to the original hidden inputs so the site's own submit handling
stays intact.
