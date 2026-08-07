import { apiFetch } from './juicewrldApi'

export interface TrackerChange {
  id: string
  proposal_id: number
  song_id: number | null
  action: string
  name: string
  user: string
  fields: string[]
  notes: string
  timestamp: string | null
  link: string
}

export interface CompChange {
  id: string
  action: string
  path: string
  name: string
  folder: string
  user: string
  size: number | null
  md5: string
  source_path: string
  timestamp: string | null
  link: string
}

interface Results<T> {
  results: T[]
}

export async function fetchTrackerChanges(limit = 60): Promise<TrackerChange[]> {
  const res = await apiFetch<Results<TrackerChange>>('/feeds/tracker.json', { limit })
  return res.results ?? []
}

export async function fetchCompChanges(limit = 60): Promise<CompChange[]> {
  const res = await apiFetch<Results<CompChange>>('/feeds/comp.json', { limit })
  return res.results ?? []
}
