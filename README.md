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
would take Colophon away from them until their next update check.

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

This bumps the version in `version.mjs`, builds, deploys, then polls the published
`.meta.js` until it actually serves the new version and finally commits and tags. It
stops at the first thing that goes wrong: a failed build rolls the version back and a CDN
that keeps serving the old number is reported as a failure rather than a success. Pushing
is left to you with `git push --follow-tags`.

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
