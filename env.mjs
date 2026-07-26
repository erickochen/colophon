// Reads .env.deploy (KEY=value lines, git-ignored) into process.env without a
// dependency. Hosting details live there, never in the repository.
import { readFileSync, existsSync } from 'node:fs'

export function loadDeployEnv() {
  const file = new URL('./.env.deploy', import.meta.url)
  if (!existsSync(file)) return process.env
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return process.env
}
