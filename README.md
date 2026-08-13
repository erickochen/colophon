# Colophon

A userscript that rebuilds the MyAnonaMouse interface as a modern tracker UI. It renders
its own React application into a shadow root on top of the existing site, keeping the
original DOM available as a fallback so the site's own scripts keep working.

Built with Vite, React 19, Tailwind v4 and shadcn/ui, bundled by vite-plugin-monkey.

It ships as two files. The installed userscript is a small loader that hides the page and
then runs the application from the site's own local storage, downloading it once per
version. A userscript manager only has to move the loader on each navigation, which is what
lets the loader cover the page before the original layout reaches the screen.

## Requirements

- Node 20 or newer
- pnpm
- A userscript manager (Violentmonkey or Tampermonkey)
- An account on the site, since every page it renders is behind login

## Build

```sh
pnpm install
pnpm build
```

`dist/` gets three files:

- `colophon.user.js`, the loader you install, around 4 kB
- `colophon.meta.js`, the light file managers poll for `@version`
- `colophon-<version>.payload.js`, the application

The payload name is a digest of its own bytes, so its URL never has to be purged from a CDN
and two builds can never disagree about what a name holds. The loader carries that URL plus
the full hash, checks it after downloading, then keeps the result in local storage on the
site's own origin and hashes it again on every read.

Payload objects from earlier releases have to stay on the storage zone. Anyone whose manager
has not fetched the new loader yet is still asking for the older name, so pruning the zone
would take Colophon away from them until their next update check. The same rule is what
keeps a slow storage replica harmless: a region still handing out an older loader sends
those installs to the payload that loader was built with, which is still there.

When a download fails, the loader may start one older copy: the release right before this
one. `FALLBACK_PAYLOAD_SHA256` records the digest baked into this release while
`PUBLISHED_PAYLOAD_SHA256` records what this release shipped for the next one to use.
Keeping those fields separate makes a tagged release reproducible. Nothing else in local
storage is eligible, because an entry stored there cannot vouch for its own bytes. A build
whose predecessor shipped the same payload has no fallback at all.

`pnpm build:fast` skips the TypeScript check when you only need to see a change in the
browser. To point a build at a local server instead of the hosted copy, override the
hosting variables for that one run:

```sh
SITE_URL=http://127.0.0.1:8080 BASE_PATH=cf pnpm build:fast
```

## Deploy

`pnpm run deploy` runs a full build and then uploads `dist/` to the configured storage
zone, purging the CDN afterwards so update checks see the new version straight away. Copy
`.env.deploy.example` to `.env.deploy` and fill in your own credentials and target. That
file is ignored by git and must stay out of the repository.

The same file holds `SITE_URL` and `BASE_PATH`, which become the `@updateURL`, the
`@downloadURL` plus the payload URL the loader downloads from. The build stops without them,
since a loader with nowhere to fetch from is of no use.

## Release

```sh
pnpm release            # minor bump
pnpm release patch      # patch or major instead
```

This runs the tests, reads the regions off the Bunny Storage Zone, then bumps the version in
`version.mjs`, builds and deploys. Anything that can be settled before a byte moves is
settled first, so a failing test or a refused key costs nothing.

The gate is the nearby CDN edge: the exact meta, loader and payload bytes have to match this
build, including every compression variant of the two mutable files. Nothing is committed or
tagged until they do.

After that it asks Globalping for exact byte ranges of the meta plus the loader near every
region the zone replicates to. That part reports without holding up the release. Bunny's
replicas can trail an upload by hours while a region still serving the previous release keeps
working there, so this is worth knowing rather than worth blocking on. The report names the
regions that trail, the version each one hands out plus the replicas that actually answered.
A region with no probe city is listed and skipped.

`BUNNY_API_KEY` is required for a release, since it both purges and lists the regions.
`GLOBALPING_TOKEN` is optional and raises Globalping's hourly allowance.

A failed build rolls the version back. Once an upload has happened the new version stays
in `version.mjs`, because some origins may already serve it; use `pnpm release resume` to
retry that same release after fixing a purge or a connectivity problem. Resuming rebuilds
the same bytes, since the version plus the baked fallback are both unchanged. A plain
`pnpm release` refuses to run while a bump is sitting there uncommitted, so an unfinished
release cannot quietly cost a version number. Pushing is left to you with
`git push --follow-tags`.

Deploying without a version bump uploads fine but reaches nobody, since update checkers
only compare `@version`. That is why the bump is part of the same command.

Note that `pnpm deploy` without `run` is a reserved pnpm command and will not execute the
script.

## Layout

```
src/
  loader.ts         the installed userscript: veil, cache, payload injection
  main.tsx          bootstrap: shadow root, style injection, page routing
  app/
    router.tsx      maps a site URL to a view
    pages/          one view per page of the site
    shell/          sidebar, topbar, command menu, dialog host
  components/ui/    shadcn components, portals patched into the shadow root
  lib/              site API clients, DOM extractors, form mirroring, formatting
```

## Implementation notes

The site sends a strict CSP: no external hosts and no `data:` fonts, so the UI relies on
system font stacks and same-origin requests only. All styling is injected into the shadow
root, which keeps the site's own stylesheets from bleeding in.

Pages fall into three groups. Some are rendered from official JSON endpoints, some are
parsed out of the server HTML and some are mirrored forms, where the rebuilt controls write
straight through to the original hidden inputs so the site's own submit handling stays
intact.
