// One-command release: bump, build, deploy, verify, record.
// Usage: pnpm release [patch|minor|major]   (default: minor)
// The published .meta.js is checked afterwards: managers compare @version.
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadDeployEnv } from './env.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))

const CONFIG = new URL('./vite.config.ts', import.meta.url)
const META = 'colophon.meta.js'
const ATTEMPTS = 10
const WAIT_MS = 3000

const say = (msg) => console.log(`[release] ${msg}`)
const die = (msg) => { console.error(`[release] ${msg}`); process.exit(1) }
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

loadDeployEnv()
const { SITE_URL, BASE_PATH } = process.env
if (!SITE_URL || !BASE_PATH) die('SITE_URL and BASE_PATH must be set in .env.deploy')
const metaUrl = [SITE_URL.replace(/\/$/, ''), BASE_PATH.replace(/^\/|\/$/g, ''), META].filter(Boolean).join('/')

// Commits must carry the repo-local identity. The address in a commit object is
// permanent, so the global config is not a fallback here.
let identity
try {
  identity = `${git('config', '--local', 'user.name')} <${git('config', '--local', 'user.email')}>`
} catch {
  die('no repo-local git identity. Set user.name and user.email with git config --local first.')
}

const bump = process.argv[2] ?? 'minor'
if (!['patch', 'minor', 'major'].includes(bump)) die(`unknown bump "${bump}", use patch, minor or major`)

const source = readFileSync(CONFIG, 'utf8')
const found = source.match(/version:\s*'(\d+)\.(\d+)\.(\d+)'/)
if (!found) die('no version found in vite.config.ts')

const [major, minor, patch] = found.slice(1).map(Number)
const next = bump === 'major' ? `${major + 1}.0.0` : bump === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`
const current = `${major}.${minor}.${patch}`

say(`${current} -> ${next}`)
writeFileSync(CONFIG, source.replace(found[0], `version: '${next}'`))

const revert = () => {
  writeFileSync(CONFIG, source)
  say(`version reverted to ${current}`)
}

const run = (cmd, args, failure) => {
  try {
    execFileSync(cmd, args, { stdio: 'inherit', cwd: HERE, env: { ...process.env } })
  } catch {
    revert()
    die(failure)
  }
}

// Build first: deploy.mjs only uploads whatever is already in dist/, so without
// this it would ship the previous bundle under the new version number.
run('pnpm', ['build'], 'build failed, nothing was released')
say(`build ok, ${(statSync(new URL('./dist/colophon.user.js', import.meta.url)).size / 1048576).toFixed(2)} MB`)
run('node', ['deploy.mjs'], 'deploy failed, nothing was released')

// The CDN may still serve the cached meta for a moment after the purge.
say(`checking ${metaUrl}`)
let live = null
for (let i = 1; i <= ATTEMPTS; i++) {
  const res = await fetch(metaUrl, { cache: 'no-store' })
  live = (await res.text()).match(/@version\s+(\S+)/)?.[1] ?? null
  if (live === next) { say(`attempt ${i}: ${live}, live`); break }
  say(`attempt ${i}: ${live ?? 'no version'}, waiting`)
  if (i < ATTEMPTS) await new Promise((r) => setTimeout(r, WAIT_MS))
}

if (live !== next) {
  die(`CDN still serves ${live} after ${ATTEMPTS} attempts. The upload happened, so retry the purge or wait for the cache to expire. Version stays at ${next}.`)
}

git('add', '-A')
git('commit', '-m', `Release ${next}`)
git('tag', `v${next}`)
say(`committed and tagged v${next} as ${identity}`)
say(`done. Push when you want to: git push --follow-tags`)
