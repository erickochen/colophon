// MAM+ plaintext shape, one line per result:
// Title (Series #part) BY Author AND Author FT Narrator AND Narrator
import { parsePeople } from '@/lib/mam-api'
import { decodeEntities } from '@/lib/format'

export interface PlaintextRow {
  title: string
  author_info: string | null
  narrator_info: string | null
  series_info: string | null
}

function names(info: string | null, decode: boolean): string[] {
  return parsePeople(info).map((p) => (decode ? decodeEntities(p.name) : p.name))
}

export function plaintextLine(row: PlaintextRow, opts: { decode?: boolean } = {}): string {
  const decode = opts.decode ?? false
  const series = parsePeople(row.series_info).map(
    (s) => (decode ? decodeEntities(s.name) : s.name) + (s.part ? ` #${s.part}` : '')
  )
  const authors = names(row.author_info, decode)
  const narrators = names(row.narrator_info, decode)
  let line = decode ? decodeEntities(row.title) : row.title
  if (series.length) line += ` (${series.join(', ')})`
  if (authors.length) line += ` BY ${authors.join(' AND ')}`
  if (narrators.length) line += ` FT ${narrators.join(' AND ')}`
  return line
}

export function plaintextResults(rows: PlaintextRow[], opts: { decode?: boolean } = {}): string {
  return rows.map((row) => plaintextLine(row, opts)).join('\n')
}
