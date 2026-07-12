// Era abbreviation → full display name (e.g. "WOD" → "WRLD On Drugs").
//
// The API's era objects carry the abbreviation in `name`; the human-readable
// full name only exists inside `description`, usually suffixed with an "era"
// qualifier and a time frame — "WRLD On Drugs era (August 2018-December 2018)".
// This module fetches /eras/ once (paginated, 34 across 2 pages), derives the
// clean full names, and exposes a synchronous lookup for display code
// (currently Discord RPC).

import { apiFetch, apiPeek, JWApiEra } from './juicewrldApi'

type ErasResponse = JWApiEra[] | { count: number; next: string | null; results: JWApiEra[] }

// Hard cap on pages followed, in case the API's pagination ever misbehaves.
const MAX_PAGES = 10

const names: Record<string, string> = {}
let loadPromise: Promise<void> | null = null

function fullName(era: JWApiEra): string | undefined {
  const desc = era.description?.trim()
  if (!desc) return undefined
  const stripped = desc
    // A trailing "(...)" containing a year is a time frame — drop it. This
    // keeps meaningful parentheticals like "The Pre Party (Extended)".
    .replace(/\s*\([^)]*\d{4}[^)]*\)$/, '')
    .replace(/\s+era$/i, '')
    .trim()
  return stripped || undefined
}

function pageParams(page: number): Record<string, number> {
  // Page 1 is plain "/eras/" so the cache key matches what the views that
  // fetch the era list already write/read.
  return page === 1 ? {} : { page }
}

/** True when this page says another follows (flat arrays never do). */
function ingest(data: ErasResponse | undefined): boolean {
  if (!data) return false
  const results = Array.isArray(data) ? data : data.results ?? []
  for (const era of results) {
    const full = fullName(era)
    if (full) names[era.name] = full
  }
  return !Array.isArray(data) && !!data.next
}

// Seed synchronously from the offline cache so lookups can succeed before
// (or without) the network fetch below.
for (let page = 1; page <= MAX_PAGES; page++) {
  if (!ingest(apiPeek<ErasResponse>('/eras/', pageParams(page)))) break
}

/** Fetches all era pages once and fills the lookup. Safe to call repeatedly —
 *  the fetch is shared; a failed one is forgotten so a later call retries. */
export function loadEraFullNames(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      for (let page = 1; page <= MAX_PAGES; page++) {
        if (!ingest(await apiFetch<ErasResponse>('/eras/', pageParams(page)))) break
      }
    })()
    loadPromise.catch(() => { loadPromise = null })
  }
  return loadPromise
}

/** Full era name for an abbreviation, if known. Synchronous — returns
 *  undefined until loadEraFullNames (or the offline cache) has run. */
export function eraFullName(abbrev: string | null | undefined): string | undefined {
  return abbrev ? names[abbrev] : undefined
}
