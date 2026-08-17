// A new request runs over three POSTs on MAM: the main category picks which
// form the server renders, that form goes back for a dupe check plus the last
// POST spends the credit. This module does the first two and hands the third
// to a real form so MAM decides where the reader lands.
import { decodeEntities } from '@/lib/format'
import { draftStore } from '@/lib/draft'
import { mamFetch } from '@/lib/mam-fetch'

const REQUEST_URL = '/tor/newRequest.php'
const ISBN_URL = '/json/isbn.php'
const TORRENT_DUPE_URL = '/tor/json/torrentDupeCheck.php'
const REQUEST_DUPE_URL = '/tor/json/requestDupeCheck.php'
/** Both dupe checks answer within a few seconds; MAM gives them the same. */
const DUPE_TIMEOUT_MS = 15000

export interface Option {
  value: string
  label: string
}

/** One media type of the new taxonomy, as MAM's own picker lists them. */
export interface MediaTypeChoice {
  id: number
  name: string
  /** Which of MAM's four searchable sections this type files under. */
  mainCat: string
}

/** MAM keeps two systems side by side: the searchable section (tor[mainCat],
 * 13 to 16) and the newer media type. The section stays a separate field, so
 * picking a type fills it in rather than asking twice. */
export const MEDIA_TYPES: MediaTypeChoice[] = [
  { id: 1, name: 'Audiobook', mainCat: '13' },
  { id: 2, name: 'Ebook', mainCat: '14' },
  { id: 5, name: 'Manga', mainCat: '14' },
  { id: 6, name: 'Comic Book / Graphic Novel', mainCat: '14' },
  { id: 3, name: 'Musicology', mainCat: '15' },
  { id: 4, name: 'Radio', mainCat: '16' },
  { id: 7, name: 'Periodical Ebook', mainCat: '14' },
  { id: 8, name: 'Periodical Audiobook', mainCat: '13' },
]

export const MAIN_CAT_NAMES: Record<string, string> = {
  '13': 'Audiobooks',
  '14': 'Ebooks',
  '15': 'Musicology',
  '16': 'Radio',
}

/** The shape of the form MAM renders for one section. */
export interface RequestForm {
  mainCat: string
  languages: Option[]
  /** The searchable category, still its own required field. */
  categories: Option[]
  flags: { name: string; label: string }[]
  hasNarrator: boolean
  /** Values MAM carries in hidden inputs, passed back untouched. */
  hidden: Record<string, string>
  /** Latest date the server accepts, since nothing unreleased may be asked for. */
  releaseMax: string | null
}

export interface SeriesEntry {
  name: string
  extra: string
}

export interface RequestValues {
  mediaType: string
  isbn: string
  title: string
  authors: string[]
  series: SeriesEntry[]
  narrators: string[]
  language: string
  category: string
  mainType: string
  categories: string[]
  posterURL: string
  publishedURL: string
  releaseDate: string
  description: string
  bookDescription: string
  flags: string[]
}

export function emptyValues(): RequestValues {
  return {
    mediaType: '', isbn: '', title: '', authors: [''], series: [{ name: '', extra: '' }],
    narrators: [''], language: '', category: '', mainType: '', categories: [],
    posterURL: '', publishedURL: '', releaseDate: '', description: '', bookDescription: '', flags: [],
  }
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

function parseHtml(text: string): Document {
  return new DOMParser().parseFromString(text, 'text/html')
}

/** The request form of a section. MAM only serves it in answer to a POST, so
 * the section choice has to travel with the request. */
export async function fetchRequestForm(mainCat: string): Promise<RequestForm> {
  const res = await mamFetch(REQUEST_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ 'tor[mainCat]': mainCat }).toString(),
  })
  if (!res.ok) throw new Error(`request form failed: ${res.status}`)
  return readRequestForm(parseHtml(await res.text()), mainCat)
}

export function readRequestForm(doc: Document, mainCat: string): RequestForm {
  const form = doc.querySelector<HTMLFormElement>('#newReq form')
  if (!form) throw new Error('request form missing')

  const options = (name: string): Option[] =>
    [...form.querySelectorAll<HTMLOptionElement>(`select[name="${name}"] option`)]
      .filter((o) => o.value && !o.disabled)
      .map((o) => ({ value: o.value, label: clean(o.textContent) }))

  const hidden: Record<string, string> = {}
  for (const el of form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')) {
    if (el.name) hidden[el.name] = el.value
  }
  hidden['tor[mainCat]'] = mainCat

  return {
    mainCat,
    languages: options('tor[language]'),
    categories: options('tor[category]'),
    flags: [...form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name^="tor[flags]"]')].map((el) => ({
      name: el.name,
      label: clean(el.closest('label')?.textContent).replace(/:$/, ''),
    })),
    hasNarrator: !!form.querySelector('input[name="tor[narrator][]"]'),
    hidden,
    releaseMax: form.querySelector<HTMLInputElement>('input[name="tor[releaseDate]"]')?.getAttribute('max') ?? null,
  }
}

/** The body MAM's own form would send, in its field order. */
export function requestBody(values: RequestValues, form: RequestForm): URLSearchParams {
  const body = new URLSearchParams()
  for (const [name, value] of Object.entries(form.hidden)) body.append(name, value)
  body.append('tor[isbn]', values.isbn)
  body.append('tor[title]', values.title)
  for (const a of values.authors) body.append('tor[author][]', a)
  values.series.forEach((s, i) => {
    body.append(`tor[series][${i}][name]`, s.name)
    body.append(`tor[series][${i}][extra]`, s.extra)
  })
  if (form.hasNarrator) for (const n of values.narrators) body.append('tor[narrator][]', n)
  body.append('tor[language]', values.language)
  body.append('tor[category]', values.category)
  body.append('tor[mediaType]', values.mediaType)
  body.append('tor[main_cat]', values.mainType)
  for (const c of values.categories) body.append('tor[categories][]', c)
  body.append('tor[posterURL]', values.posterURL)
  body.append('tor[publishedURL]', values.publishedURL)
  body.append('tor[releaseDate]', values.releaseDate)
  body.append('tor[description]', values.description)
  body.append('tor[bookDescription]', values.bookDescription)
  for (const f of values.flags) body.append(f, 'on')
  body.append('submit', 'Proceed to final step')
  return body
}

export interface FieldError {
  /** MAM's own key, uppercased, like CATEGORIES or MEDIATYPE. */
  key: string
  message: string
}

export type DetailsResult =
  | { ok: true; combined: string; lr: string }
  | { ok: false; errors: FieldError[] }

/** MAM lists what it refused as an h4 per field with the reason behind it. */
export function readErrors(doc: Document): FieldError[] {
  const box = [...doc.querySelectorAll('td.text')].find((td) => /Validation failed/i.test(td.textContent ?? ''))
  if (!box) return []
  const errors: FieldError[] = []
  for (const head of box.querySelectorAll('h4')) {
    let message = ''
    for (let n = head.nextSibling; n; n = n.nextSibling) {
      if (n.nodeType === Node.ELEMENT_NODE && /^(H4|HR)$/.test((n as Element).tagName)) break
      message += n.textContent ?? ''
    }
    errors.push({ key: clean(head.textContent).toUpperCase(), message: clean(message) })
  }
  return errors
}

/** Sends the filled form. MAM answers with either its complaints or the last
 * step, which carries every value back as one blob. */
export async function submitDetails(values: RequestValues, form: RequestForm): Promise<DetailsResult> {
  const res = await mamFetch(REQUEST_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: requestBody(values, form).toString(),
  })
  if (!res.ok) throw new Error(`request submit failed: ${res.status}`)
  const doc = parseHtml(await res.text())
  const combined = doc.querySelector<HTMLInputElement>('input[name="combined"]')?.value
  if (combined) {
    return { ok: true, combined, lr: doc.querySelector<HTMLInputElement>('input[name="lr"]')?.value ?? '0.00000' }
  }
  const errors = readErrors(doc)
  return { ok: false, errors: errors.length ? errors : [{ key: 'FORM', message: 'MAM did not accept the form.' }] }
}

export interface DupeTorrent {
  id: number
  title: string
  added: number
  category: number
  size: number
  sizeReadable: string
  filetype: string
  authors: string[]
  narrators: string[]
}

export interface DupeRequest {
  requestTime: string
  title: string
  category: number
  authors: string[]
}

type RawPeople = Record<string, string | { name?: string }>

/** Names arrive keyed by id, either as plain strings or as objects. */
const people = (raw: RawPeople | undefined): string[] =>
  Object.values(raw ?? {})
    .map((n) => decodeEntities(String(typeof n === 'object' && n ? n.name ?? '' : n)))
    .filter(Boolean)

async function dupePost(url: string, combined: string): Promise<Record<string, unknown>> {
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), DUPE_TIMEOUT_MS)
  try {
    const res = await mamFetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ combined }).toString(),
      signal: stop.signal,
    })
    if (!res.ok) throw new Error(`dupe check failed: ${res.status}`)
    return (await res.json()) as Record<string, unknown>
  } finally {
    clearTimeout(timer)
  }
}

export async function checkTorrentDupes(combined: string): Promise<DupeTorrent[]> {
  const json = await dupePost(TORRENT_DUPE_URL, combined)
  const rows = Array.isArray(json.matches) ? (json.matches as Record<string, unknown>[]) : []
  return rows.map((r) => ({
    id: Number(r.id),
    title: decodeEntities(String(r.title ?? '')),
    added: Number(r.added ?? 0),
    category: Number(r.category ?? 0),
    size: Number(r.size ?? 0),
    sizeReadable: String(r.sizeReadable ?? ''),
    filetype: String(r.filetype ?? ''),
    authors: people(r.author as RawPeople),
    narrators: people(r.narrator as RawPeople),
  }))
}

export async function checkRequestDupes(combined: string): Promise<DupeRequest[]> {
  const json = await dupePost(REQUEST_DUPE_URL, combined)
  const rows = Array.isArray(json.matches) ? (json.matches as Record<string, unknown>[]) : []
  return rows.map((r) => ({
    requestTime: String(r.requestTime ?? ''),
    title: decodeEntities(String(r.title ?? '')),
    category: Number(r.category ?? 0),
    authors: Array.isArray(r.author)
      ? (r.author as { name?: string }[]).map((a) => decodeEntities(String(a?.name ?? '')))
      : people(r.author as RawPeople),
  }))
}

/** MAM's own metadata lookup, shared by the ISBN button plus the JSON paste. */
export interface FillData {
  title?: string
  subtitle?: string
  isbn?: string
  thumbnail?: string
  description?: string
  authors?: string[]
  narrators?: string[]
  series?: (string | { name?: string; extra?: string; number?: string | number })[]
  category?: string | number
  main_cat?: string | number
  mediaType?: string | number
  categories?: (string | number)[]
  language?: string | number
  flags?: string[]
  totalItems?: number
  success?: boolean
  msg?: string
}

export async function lookupIsbn(isbn: string): Promise<FillData> {
  const res = await mamFetch(`${ISBN_URL}?isbn=${encodeURIComponent(isbn)}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`isbn lookup failed: ${res.status}`)
  return (await res.json()) as FillData
}

/** Categories MAM's own fill refuses, since a general bucket says nothing. */
const GENERAL_CATEGORIES = new Set(['42', '52', '64', '74'])

/** Folds looked-up metadata into the values. Anything the lookup has nothing
 * to say about keeps what is already typed. */
export function applyFill(values: RequestValues, data: FillData, form: RequestForm): RequestValues {
  const next = { ...values }
  if (data.title) next.title = data.subtitle && data.subtitle !== 'null' ? `${data.title}: ${data.subtitle}` : data.title
  if (data.isbn) next.isbn = String(data.isbn)
  if (data.thumbnail) next.posterURL = String(data.thumbnail)
  if (data.description) next.bookDescription = String(data.description)
  if (data.authors?.length) next.authors = data.authors.map(String)
  if (data.narrators?.length) next.narrators = data.narrators.map(String)
  if (data.series?.length) {
    // MAM's own blob calls the position `number`; our form field is `extra`.
    next.series = data.series.map((s) =>
      typeof s === 'string'
        ? { name: s, extra: '' }
        : { name: String(s.name ?? ''), extra: String(s.extra ?? s.number ?? '') }
    )
  }
  const byLabel = (list: Option[], wanted: string | number | undefined) => {
    if (wanted === undefined || wanted === null || wanted === '') return null
    const text = String(wanted)
    return list.find((o) => o.value === text)?.value ?? list.find((o) => o.label === text)?.value ?? null
  }
  const cat = byLabel(form.categories, data.category)
  if (cat && !GENERAL_CATEGORIES.has(cat)) next.category = cat
  const lang = byLabel(form.languages, data.language)
  if (lang) next.language = lang
  if (data.main_cat) next.mainType = String(data.main_cat)
  if (data.mediaType) next.mediaType = String(data.mediaType)
  if (data.categories?.length) next.categories = data.categories.map(String)
  if (data.flags?.length) {
    const names = data.flags.map((f) => `tor[flags][${f}]`)
    next.flags = [...new Set([...next.flags, ...names.filter((n) => form.flags.some((f) => f.name === n))])]
  }
  return next
}

/** Splits a pasted block of names the way MAM's fast fill does. */
export function splitNames(text: string, alsoAmpersand = false): string[] {
  const source = alsoAmpersand ? text.replace(/&/g, '\n') : text
  return source
    .replace(/;/g, '\n')
    .split(/\r?\n/)
    .map((n) => n.trim())
    .filter(Boolean)
}

const DRAFT_KEY = 'colophon:new-request'
/** How long an unsent request is offered back, in milliseconds. */
const DRAFT_TTL = 7 * 24 * 60 * 60 * 1000

export interface RequestDraft {
  values: RequestValues
  mainCat: string
  step: number
}

const store = draftStore<RequestDraft>(DRAFT_KEY, DRAFT_TTL, (d) =>
  !!d.values && (!!d.values.title || d.values.authors.some(Boolean))
)

export const readRequestDraft = (): RequestDraft | null => store.read()
export const writeRequestDraft = (draft: RequestDraft): void => store.write(draft)
export const clearRequestDraft = (): void => store.clear()
