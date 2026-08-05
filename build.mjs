// Builds both halves in the order they depend on each other: the payload first,
// because the loader has to carry its URL plus its hash.
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { loadDeployEnv } from './env.mjs'
import { VERSION, LOADER_FILE, META_FILE, payloadName } from './version.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const DIST = fileURLToPath(new URL('./dist/', import.meta.url))
const RAW_PAYLOAD = 'colophon.payload.raw.js'
const HEADER_END = '// ==/UserScript=='

const say = (msg) => console.log(`[build] ${msg}`)
const die = (msg) => { console.error(`[build] ${msg}`); process.exit(1) }
const kb = (n) => `${(n / 1024).toFixed(1)} kB`
const dist = (name) => new URL(`./dist/${name}`, import.meta.url)

loadDeployEnv()
for (const key of ['SITE_URL', 'BASE_PATH']) {
  if (!process.env[key]) die(`${key} missing. The loader needs a payload URL, so set it in .env.deploy.`)
}
const base = [process.env.SITE_URL.replace(/\/$/, ''), process.env.BASE_PATH.replace(/^\/?|\/$/g, '')]
  .filter(Boolean)
  .join('/')

const run = (cmd, args, env) =>
  execFileSync(cmd, args, { stdio: 'inherit', cwd: HERE, env: { ...process.env, ...env } })

rmSync(DIST, { recursive: true, force: true })
mkdirSync(DIST, { recursive: true })

say(`payload ${VERSION}`)
run('pnpm', ['exec', 'vite', 'build', '--config', 'vite.payload.config.ts'])
run('node', ['postbuild.mjs', `dist/${RAW_PAYLOAD}`])

if (!existsSync(dist(RAW_PAYLOAD))) die(`payload build produced no ${RAW_PAYLOAD}`)
const raw = readFileSync(dist(RAW_PAYLOAD), 'utf8')
const cut = raw.indexOf(HEADER_END)
if (cut < 0) die('no metadata block in the payload build, so nothing to strip')
const payload = raw.slice(cut + HEADER_END.length).replace(/^\s+/, '')
if (payload.includes(HEADER_END)) die('more than one metadata block in the payload build')
if (!payload.includes(VERSION)) die('the payload does not carry its own version marker')

const sha = createHash('sha256').update(payload, 'utf8').digest('hex')
const name = payloadName(sha)
writeFileSync(dist(name), payload)
rmSync(dist(RAW_PAYLOAD), { force: true })
say(`${name} ${kb(Buffer.byteLength(payload))}`)

say('loader')
run('pnpm', ['exec', 'vite', 'build'], {
  COLOPHON_PAYLOAD_SHA256: sha,
  COLOPHON_PAYLOAD_URL: `${base}/${name}`,
})

for (const file of [LOADER_FILE, META_FILE, name]) {
  if (!existsSync(dist(file))) die(`${file} is missing from dist/`)
  say(`${file} ${kb(statSync(dist(file)).size)}`)
}

const loader = readFileSync(dist(LOADER_FILE), 'utf8')
if (!loader.includes(sha)) die('the loader does not carry the payload hash')
if (!loader.includes(name)) die('the loader does not carry the payload URL')
say('done')
