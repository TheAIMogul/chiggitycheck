// API contract shared by the Worker (worker/) and the React app (src/).
// Every endpoint returns JSON. Errors: { error: { code, message } } with a non-2xx status.

export type Program = 'mentoring' | 'counseling' | 'workshop';
export type Lang = 'en' | 'es' | 'ht';
export type Severity = 'fine' | 'watch' | 'call' | 'urgent';
export type Mark = 'present' | 'absent' | 'unclear';
export type FollowupStatus = 'open' | 'sent' | 'replied' | 'closed' | 'not_needed';
export type BBox = [number, number, number, number]; // x, y, w, h normalized 0..1 of the photo

export interface ApiError { error: { code: string; message: string } }

/* ---------------- shared bits ---------------- */
export interface StripDot { session_id: number; held_at: string; mark: Mark; flagged: boolean }

export interface Fact {
  kind: 'sheet' | 'mentor' | 'form' | 'schedule' | 'contact';
  label: string;        // "Missed Sep 9, 16, 23"
  source: string;       // "3 sheets", "since Jul 15", "sign-up form"
}

export interface MessageEvent { status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received'; at: string }
export interface ChannelMessage {
  id: number; direction: 'out' | 'in'; channel: 'whatsapp' | 'sms'; body: string;
  provider: string; provider_message_id: string | null; status: string; created_at: string; events: MessageEvent[];
}

export interface FollowupItem {
  id: number;
  kid_id: number; kid_name: string; kid_initials: string; kid_grade: string; kid_school: string;
  family_id: number; household_name: string; guardian_name: string; guardian_relationship: string; guardian_phone: string;
  language: Lang;
  severity: Severity; severity_score: number; severity_confidence: number; needs_staff_review: boolean;
  reason: string;                       // plain words: "3 missed in a row · last here Sep 2"
  headline: string;                     // "Missed 3 Wednesdays in a row. Nobody has called yet."
  consecutive_misses: number; misses_30d: number; last_present: string | null;
  mentor_name: string | null; mentor_since: string | null; program: Program; site: string;
  recent: { date: string; mark: Mark }[]; // last 4 sessions for this kid, oldest first
  strip: StripDot[];                    // this quarter
  draft_text: string; draft_translation: string | null; draft_highlights: string[]; // substrings to highlight
  facts: Fact[];
  status: FollowupStatus; created_at: string; sent_at: string | null; replied_at: string | null;
  next_session: string | null;          // "Wed Sep 30, 4:00 pm"
  messages: ChannelMessage[];
  reminder_at: string | null;           // when the nudge fires if no reply
}

/* ---------------- GET /api/week ---------------- */
export interface WeekSession {
  program: Program; site: string; time: string; status: 'captured' | 'waiting' | 'upcoming';
  kids: number | null; session_id: number | null; sample_key: string | null;
}
export interface WeekResponse {
  today: string; now: string; greeting: string;
  range: { start: string; end: string };
  headline: { count: number; text: string; sub: string };
  plan: {
    snap: { done: boolean; label: string; detail: string; sample_key: string | null };
    calls: { done: number; total: number };
    report: { ready: boolean; due: string };
  };
  days: { date: string; dow: string; day: number; is_today: boolean; sessions: WeekSession[] }[];
  sheets_in: number; sheets_expected: number;
  call: FollowupItem[]; watch: FollowupItem[];
  stats: {
    attendance_rate_quarter: number; attendance_rate_week: number | null; delta_pts: number;
    weekly_rates: { week: string; rate: number }[];
    reached: number; flagged: number; median_days_to_contact: number | null;
    hours_quarter: number; hours_dupes_removed: number; mentors: number;
    top_mentor: { name: string; hours: number } | null; mentor_initials: string[];
  };
  feed: { kind: 'read' | 'merge' | 'dedupe' | 'draft' | 'alias' | 'signup' | 'reply' | 'send'; text: string; bold: string; when: string; link: string | null }[];
  typing_hours_saved: number;
  checks: { kind: 'signups' | 'school_change' | 'unmatched'; title: string; detail: string; link: string }[];
}

/* ---------------- Snap / sheets ---------------- */
export interface SampleSheet {
  key: string; label: string; site: string; program: Program; held_at: string; time: string;
  photo_url: string; already_captured: boolean; session_id: number | null; recommended: boolean;
}
export interface UploadResponse {
  session_id: number; photo_url: string;
  status: 'reading' | 'already_captured'; captured_at?: string; upload_ms: number;
}
export interface Candidate {
  kid_id: number; name: string; school: string; grade: string; program: Program; mentor: string | null; probability: number;
}
export interface ReadRow {
  row_index: number; raw_text: string; mark: Mark; bbox: BBox | null;
  candidates: Candidate[]; best: { kid_id: number; probability: number } | null;
  decision: 'auto' | 'ask' | 'new'; new_spelling: boolean; mark_question: boolean;
}
export interface ReadResponse {
  session_id: number; photo_url: string;
  header: {
    program: Program; site: string; held_at: string; time: string;
    facilitator: string; facilitator_mentor_id: number | null; confidence: number;
  };
  rows: ReadRow[];
  timings: { upload_ms: number; read_ms: number; match_ms: number };
  read_source: 'live' | 'verified_fallback';
  models: { vision: string; decisions: string };
  preview: {
    attendance: number; new_spellings: number; hours: number; facilitator: string;
    followup_changes: { kid_id: number; kid_name: string; from: Severity | null; to: Severity }[];
  };
}
export interface ConfirmRow {
  row_index: number; kid_id: number | null; action: 'accept' | 'new' | 'skip'; mark: Mark;
  new_kid?: { first_name: string; last_name: string };
}
export interface ConfirmRequest {
  header: { program: Program; site: string; held_at: string; facilitator_mentor_id: number | null };
  rows: ConfirmRow[];
}
export interface ConfirmResponse {
  session_id: number;
  attendance_written: number; present: number; absent: number; unclear: number;
  aliases_learned: number; hours_logged: number; new_kids: number;
  followups: {
    created: { followup_id: number; kid_name: string; severity: Severity }[];
    updated: { followup_id: number; kid_name: string; from: Severity; to: Severity }[];
  };
  ms: number;
}

/* ---------------- Calls ---------------- */
export interface CallsResponse {
  counts: { open: number; sent: number; replied: number; watch: number };
  items: FollowupItem[];           // filtered by ?status=open|sent|replied|watch
}
// POST /api/followups/:id/send   body { channel: 'whatsapp'|'sms' }  -> FollowupItem
// POST /api/followups/:id/called body { note?: string }              -> FollowupItem
// POST /api/followups/:id/not-needed                                 -> FollowupItem
// POST /api/followups/:id/regenerate body { language?: Lang }        -> FollowupItem
// POST /api/followups/:id/replied body { body?: string }             -> FollowupItem
// PATCH /api/followups/:id body { draft_text }                       -> FollowupItem
// GET  /api/followups/:id                                            -> FollowupItem

/* ---------------- People ---------------- */
export interface KidListItem {
  id: number; name: string; initials: string; school: string; grade: string;
  program: Program; site: string; mentor: string | null; language: Lang;
  strip: StripDot[]; rate: number | null; last_seen: string | null;
  severity: Severity | null; status: 'active' | 'changed_school' | 'exited';
  family_id: number; household_name: string; matched_alias: string | null;
}
export interface KidDetail extends KidListItem {
  family: {
    id: number; household_name: string; guardian_name: string; relationship: string; phone: string;
    language: Lang; neighborhood: string; siblings: { id: number; name: string; grade: string }[];
    signed_up: string | null; signup_source: string | null;
  };
  mentor_since: string | null; sessions_count: number; present_count: number;
  calendar: { month: string; cells: { session_id: number; held_at: string; mark: Mark; flagged: boolean }[] }[];
  aliases: { raw_text: string; source: string; dates: string; probability: number | null }[];
  history: { kind: 'urgent' | 'call' | 'watch' | 'match' | 'signup' | 'school' | 'contact' | 'sent' | 'reply'; title: string; detail: string; date: string }[];
  sessions: { session_id: number; held_at: string; site: string; program: Program; row_index: number | null; raw_text: string | null; mark: Mark; probability: number | null; photo_url: string | null; bbox: BBox | null }[];
  followup_id: number | null; followup_status: FollowupStatus | null;
  school_history: { from_school: string; to_school: string; changed_at: string; note: string }[];
}
export interface FamilyListItem {
  id: number; household_name: string; guardian_name: string; language: Lang; phone: string;
  kids: string[]; alias_count: number; open_followup: boolean;
}
export interface FamilyDetail {
  id: number; household_name: string; guardian_name: string; relationship: string; phone: string; email: string | null;
  language: Lang; neighborhood: string; address: string;
  kids: { id: number; name: string; grade: string; school: string; program: Program; site: string; status: string }[];
  sources: { kind: 'form' | 'sheet' | 'text'; label: string; date: string; raw_text: string; probability: number | null; first: boolean; photo_url: string | null; bbox: BBox | null }[];
  school_changes: { kid_name: string; from_school: string; to_school: string; changed_at: string; note: string }[];
  followups: { id: number; kid_name: string; severity: Severity; status: FollowupStatus; summary: string; date: string }[];
  contacts: { kind: string; body: string; date: string }[];
}
export interface MentorListItem {
  id: number; name: string; initials: string; kids: { id: number; name: string }[];
  hours: number; sessions: number; dupes: number; phone: string | null;
}
export interface MentorDetail extends MentorListItem {
  entries: {
    id: number; date: string; site: string; program: Program; hours: number;
    source: 'sheet' | 'text' | 'form' | 'seed'; raw_text: string | null;
    status: 'counted' | 'duplicate'; note: string | null;
  }[];
}
export interface SignupItem {
  id: number; received_at: string; source: string; guardian: string; kid: string; phone: string | null;
  language: Lang | null; resolve_probability: number | null; status: 'linked' | 'new' | 'review';
  family_id: number | null; kid_id: number | null; matched_to: string | null;
}
// POST /api/signups  (public web-form webhook) body SignupForm -> SignupResult
export interface SignupForm {
  guardian_first: string; guardian_last: string; phone: string; email?: string; language: Lang;
  kid_first: string; kid_last: string; grade: string; school: string; program: Program; neighborhood?: string;
}
export interface SignupResult {
  signup_id: number; status: 'linked' | 'new' | 'review'; probability: number | null;
  family: { id: number; name: string; existing: boolean }; kid: { id: number; name: string; existing: boolean };
  explanation: string; ms: number;
}
// POST /api/import  multipart file=CSV -> ImportResult
export interface ImportResult {
  rows: number; linked: number; created: number; review: number;
  results: { row: number; kid: string; guardian: string; status: 'linked' | 'new' | 'review'; probability: number | null; matched_to: string | null }[];
}

/* ---------------- Report ---------------- */
export interface Figure { key: string; label: string; value: string; sub: string; evidence_ref: string; spark: number[] }
export interface Breakdown { label: string; rate: number | null; kids: number; sessions: number; evidence_ref: string; locked?: boolean }
export interface ReportResponse {
  quarter: string; label: string; period: { start: string; end: string }; org: string;
  generated_from: { sheets: number; signups: number; hours_entries: number };
  traced: { linked: number; total: number };
  kpis: Figure[];
  families_served: number;
  by: { program: Breakdown[]; site: Breakdown[]; language: Breakdown[] };
  followups: { flagged: number; reached: number; back_within_2w: number; median_days: number | null; evidence_ref: string };
  mentoring: { active_matches: number; new_matches: number; active_mentors: number; avg_hours: number; evidence_ref: string };
  data_quality: { sheets: number; rows_read: number; rows_confirmed: number; aliases_learned: number; unresolved: number; confirmed_pct: number };
  snapshot: { id: number; built_at: string } | null;
}
export interface EvidenceResponse {
  ref: string; title: string; value: string; formula: string; summary: string;
  sessions: { session_id: number; held_at: string; site: string; program: Program; facilitator: string | null; present: number; absent: number; unclear: number; rate: number | null; photo_url: string | null }[];
  records: { session_id: number; held_at: string; site: string; row_index: number | null; raw_text: string | null; mark: Mark | null; kid_name: string | null; probability: number | null; photo_url: string | null; bbox: BBox | null; confirmed_at: string | null; note?: string }[];
}

/* ---------------- Integrations ---------------- */
export interface Integration {
  key: string; name: string; kind: 'messaging' | 'forms' | 'spreadsheet' | 'email' | 'calendar' | 'accounting' | 'crm';
  status: 'connected' | 'available'; mode: 'live' | 'sandbox'; detail: string;
  last_sync_at: string | null; last_result: string | null;
  actions: { label: string; method: 'GET' | 'POST'; href: string; download?: boolean }[];
}

/* ---------------- Misc ---------------- */
export interface AboutResponse {
  models: { vision: string; vision_fallback: string; decisions: string; drafting: string };
  ai_spend_usd: number; ai_calls: number; counts: Record<string, number>; today: string; repo: string;
}
export interface SearchResult { kind: 'kid' | 'family' | 'mentor'; id: number; title: string; sub: string; matched: string | null; href: string }

/* ---------------- Dataset builder (typed request → real records) ---------------- */
// POST /api/scenarios  body ScenarioRequest -> ScenarioResult   (takes 10-40s: model writes the dataset, server validates + inserts + scores follow-ups)
// GET  /api/scenarios                        -> ScenarioResult[] (newest first)
export interface ScenarioRequest { prompt: string }
export interface ScenarioResult {
  id: number; prompt: string; title: string; summary: string; model: string; ms: number; created_at: string;
  created: { families: number; kids: number; mentors: number; sessions: number; attendance: number; hours: number; signups: number; followups: number };
  steps: { label: string; ms: number }[];              // e.g. "Model wrote the dataset", "Validated 214 records", "Saved to database", "Scored follow-ups"
  highlights: { label: string; detail: string; href: string }[]; // e.g. kid profiles flagged, the new program's report evidence
}
