import type {
  WeekResponse, SampleSheet, UploadResponse, ReadResponse, ConfirmRequest, ConfirmResponse,
  CallsResponse, FollowupItem, Lang, KidListItem, KidDetail, FamilyListItem, FamilyDetail,
  MentorListItem, MentorDetail, SignupItem, SignupForm, SignupResult, ImportResult,
  ReportResponse, EvidenceResponse, Integration, SearchResult, AboutResponse,
  ScenarioResult,
} from '../shared/types'

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const init: RequestInit = { method, headers }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    headers['content-type'] = 'application/json'
  }
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError('network', 'Could not reach the server. Check the connection and try again.', 0)
  }
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = null }
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(e?.code ?? `http_${res.status}`, e?.message ?? `The server answered ${res.status}.`, res.status)
  }
  if (data === null) throw new ApiError('bad_json', 'The server sent something we could not read.', res.status)
  return data as T
}

const get = <T,>(p: string) => req<T>('GET', p)
const post = <T,>(p: string, b?: unknown) => req<T>('POST', p, b ?? {})
const qs = (o: Record<string, string | undefined | null>) => {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v) u.set(k, v)
  const s = u.toString()
  return s ? `?${s}` : ''
}

export const api = {
  week: () => get<WeekResponse>('/api/week'),
  samples: () => get<SampleSheet[]>('/api/sheets/samples'),
  upload: (file: File) => { const f = new FormData(); f.append('photo', file); return post<UploadResponse>('/api/sheets/upload', f) },
  capture: (key: string) => post<UploadResponse>(`/api/sheets/samples/${encodeURIComponent(key)}/capture`),
  read: (id: number) => post<ReadResponse>(`/api/sheets/${id}/read`),
  confirm: (id: number, body: ConfirmRequest) => post<ConfirmResponse>(`/api/sheets/${id}/confirm`, body),

  calls: (status: string) => get<CallsResponse>(`/api/calls${qs({ status })}`),
  followup: (id: number) => get<FollowupItem>(`/api/followups/${id}`),
  send: (id: number, channel: 'whatsapp' | 'sms') => post<FollowupItem>(`/api/followups/${id}/send`, { channel }),
  called: (id: number, note?: string) => post<FollowupItem>(`/api/followups/${id}/called`, note ? { note } : {}),
  notNeeded: (id: number) => post<FollowupItem>(`/api/followups/${id}/not-needed`),
  regenerate: (id: number, language?: Lang) => post<FollowupItem>(`/api/followups/${id}/regenerate`, language ? { language } : {}),
  replied: (id: number, body?: string) => post<FollowupItem>(`/api/followups/${id}/replied`, body ? { body } : {}),
  editDraft: (id: number, draft_text: string) => req<FollowupItem>('PATCH', `/api/followups/${id}`, { draft_text }),

  kids: (p: { q?: string; program?: string; site?: string; flag?: string }) => get<KidListItem[]>(`/api/kids${qs(p)}`),
  kid: (id: number) => get<KidDetail>(`/api/kids/${id}`),
  families: () => get<FamilyListItem[]>('/api/families'),
  family: (id: number) => get<FamilyDetail>(`/api/families/${id}`),
  mentors: () => get<MentorListItem[]>('/api/mentors'),
  mentor: (id: number) => get<MentorDetail>(`/api/mentors/${id}`),
  signups: () => get<SignupItem[]>('/api/signups'),
  signup: (form: SignupForm) => post<SignupResult>('/api/signups', form),
  importCsv: (file: File) => { const f = new FormData(); f.append('file', file); return post<ImportResult>('/api/import', f) },

  report: (quarter: string) => get<ReportResponse>(`/api/report${qs({ quarter })}`),
  evidence: (ref: string) => get<EvidenceResponse>(`/api/report/evidence/${encodeURIComponent(ref)}`),
  snapshot: () => post<{ id: number; built_at: string }>('/api/report/snapshot'),

  integrations: () => get<Integration[]>('/api/integrations'),
  integrationAction: (href: string) => post<{ message: string }>(href),
  search: (q: string) => get<SearchResult[]>(`/api/search${qs({ q })}`),
  about: () => get<AboutResponse>('/api/about'),
  reset: () => post<{ ok: true }>('/api/demo/reset'),

  scenarios: () => get<ScenarioResult[]>('/api/scenarios'),
  buildScenario: (prompt: string) => post<ScenarioResult>('/api/scenarios', { prompt }),
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return 'Something went wrong.'
}
