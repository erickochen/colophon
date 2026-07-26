# Colophon

A userscript that rebuilds the MyAnonaMouse interface as a modern tracker UI. It renders
its own React application into a shadow root on top of the existing site, keeping the
original DOM available as a fallback so the site's own scripts keep working.

Built with Vite, React 19, Tailwind v4 and shadcn/ui, bundled by vite-plugin-monkey into a
single `.user.js` file.

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

The bundle lands in `dist/colophon.user.js`, with `dist/colophon.meta.js` alongside it for
lightweight update polling. Managers read `@version` from the meta file and only fetch the
full script when it changes.

For a local development loop, build with the update and download URLs pointed at the file
on disk instead of the hosted copy:

```sh
pnpm build:local
```

Then install `dist/colophon.user.js` in your manager once. `pnpm build:fast` skips the
TypeScript check when you only need to see a change in the browser.

## Deploy

`pnpm run deploy` runs a full build and then uploads `dist/` to the configured storage
zone, purging the CDN afterwards so update checks see the new version straight away. Copy
`.env.deploy.example` to `.env.deploy` and fill in your own credentials and target. That
file is ignored by git and must stay out of the repository.

The same file holds `SITE_URL` and `BASE_PATH`, which `vite.config.ts` turns into the
`@updateURL` and `@downloadURL` metadata. Build without them and the script simply carries
no auto-update URLs.

## Release

```sh
pnpm release            # minor bump
pnpm release patch      # patch or major instead
```

This bumps the version in `vite.config.ts`, builds, deploys, then polls the published
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
