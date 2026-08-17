// Local storage for a half-filled form, so a misclick does not throw away what
// someone typed. Every wizard keeps its own key.

export interface Draft<T> {
  read(): T | null
  write(value: T): void
  clear(): void
}

/** A store for one form. `keep` decides whether a saved draft still holds
 * enough to be worth offering back. */
export function draftStore<T extends object>(key: string, ttlMs: number, keep: (value: T) => boolean): Draft<T> {
  return {
    read() {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        const saved = JSON.parse(raw) as T & { at?: number }
        if (typeof saved?.at !== 'number' || saved.at < Date.now() - ttlMs) return null
        return keep(saved) ? saved : null
      } catch {
        return null
      }
    },
    write(value) {
      try {
        localStorage.setItem(key, JSON.stringify({ ...value, at: Date.now() }))
      } catch {
        // private mode, the draft is a courtesy
      }
    },
    clear() {
      try {
        localStorage.removeItem(key)
      } catch {
        // nothing to clear
      }
    },
  }
}
