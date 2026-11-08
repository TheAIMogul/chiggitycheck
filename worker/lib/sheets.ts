// Capture pipeline: photo → R2 → vision read → candidate blocking → one Decisions call per sheet → staff confirm → attendance, aliases, hours, follow-ups.
import type { Candidate, ConfirmRequest, ConfirmResponse, Mark, Program, ReadResponse, ReadRow, Severity, UploadResponse } from '../../shared/types';
import { SAMPLES, VERIFIED_READS } from '../seed/samples';
import { decide, readSheet, type SheetRead } from './ai';
import { featuresFor, refreshFollowups, ruleSeverity } from './followups';
import { type Env, HttpError, addDays, md, nameScore, normalize, nowISO, sha256Hex, time12, toBase64, SITE_SHORT } from './util';

type Row = Record<string, any>;
const SITES = ['Citrus Grove MS', 'West Little River CC', 'Tidepath office'];
const SITE_KEY: Record<string, string> = { 'Citrus Grove MS': 'CG', 'West Little River CC': 'WLR', 'Tidepath office': 'OFF' };

async function storePhoto(env: Env, bytes: ArrayBuffer, mime: string, photoUrl: string | null, t0: number): Promise<UploadResponse> {
  const sha = await sha256Hex(bytes);
  const existing = await env.DB.prepare('SELECT id, status, captured_at, photo_url FROM sessions WHERE photo_sha256=?').bind(sha).first<Row>();
  if (existing) {
    if (existing.status === 'confirmed') return { session_id: existing.id, photo_url: existing.photo_url, status: 'already_captured', captured_at: existing.captured_at, upload_ms: Date.now() - t0 };
    return { session_id: existing.id, photo_url: existing.photo_url, status: 'reading', upload_ms: Date.now() - t0 };
  }
  let url = photoUrl;
  let key: string | null = null;
  if (!url) {
    key = `uploads/${sha.slice(0, 24)}.${mime.includes('png') ? 'png' : 'jpg'}`;
    await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: mime } });
    url = `/api/photos/${key}`;
  }
  const r = await env.DB.prepare(`INSERT INTO sessions (program, site, held_at, source, photo_key, photo_url, photo_sha256, status, captured_by, created_at) VALUES ('mentoring', '', ?, 'photo', ?, ?, ?, 'uploaded', ?, ?)`)
    .bind(env.DEMO_TODAY, key, url, sha, env.STAFF_NAME, nowISO(env)).run();
  return { session_id: Number(r.meta.last_row_id), photo_url: url, status: 'reading', upload_ms: Date.now() - t0 };
}

export async function upload(env: Env, file: File): Promise<UploadResponse> {
  const t0 = Date.now();
  if (!file || !file.size) throw new HttpError(400, 'no_photo', 'Attach a photo of the sheet.');
  if (file.size > 12 * 1024 * 1024) throw new HttpError(413, 'too_big', 'That photo is over 12 MB. Try again with a smaller one.');
  return storePhoto(env, await file.arrayBuffer(), file.type || 'image/jpeg', null, t0);
}

export async function captureSample(env: Env, origin: string, key: string): Promise<UploadResponse> {
  const t0 = Date.now();
  const s = SAMPLES.find((x) => x.key === key);
  if (!s) throw new HttpError(404, 'no_sample', 'That sample sheet does not exist.');
  const res = await env.ASSETS.fetch(new Request(new URL(s.photo_url, origin)));
  if (!res.ok) throw new HttpError(500, 'asset', 'Could not load the sample photo.');
  return storePhoto(env, await res.arrayBuffer(), 'image/jpeg', s.photo_url, t0);
}

async function photoBytes(env: Env, origin: string, s: Row): Promise<{ bytes: ArrayBuffer; mime: string }> {
  if (s.photo_key && String(s.photo_key).startsWith('uploads/')) {
    const o = await env.PHOTOS.get(s.photo_key);
    if (!o) throw new HttpError(404, 'photo_missing', 'The photo for this sheet is missing.');
    return { bytes: await o.arrayBuffer(), mime: o.httpMetadata?.contentType || 'image/jpeg' };
  }
  const res = await env.ASSETS.fetch(new Request(new URL(s.photo_url, origin)));
  return { bytes: await res.arrayBuffer(), mime: 'image/jpeg' };
}

function parseDate(s: string, fallback: string): string {
  const m = s.match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`; }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return fallback;
}
function parseSite(s: string): { site: string; conf: number } {
  const n = normalize(s);
  if (n.includes('citrus')) return { site: 'Citrus Grove MS', conf: 0.95 };
  if (n.includes('little river') || n.includes('wlr') || n.includes('river')) return { site: 'West Little River CC', conf: 0.93 };
  if (n.includes('office')) return { site: 'Tidepath office', conf: 0.9 };
  return { site: SITES[0], conf: 0.3 };
}
function parseProgram(s: string): Program { const n = normalize(s); return n.includes('work') ? 'workshop' : n.includes('couns') ? 'counseling' : 'mentoring'; }

/** Candidate generation in code: blocking by site/program plus string similarity and the alias table. */
async function candidatesFor(env: Env, rows: SheetRead['rows'], site: string, program: string) {
  const kids = (await env.DB.prepare(`SELECT k.id, k.first_name, k.last_name, k.preferred_name, k.grade, k.school, k.program, k.site,
      (SELECT m.full_name FROM matches x JOIN mentors m ON m.id=x.mentor_id WHERE x.kid_id=k.id AND x.ended_at IS NULL LIMIT 1) mentor
    FROM kids k WHERE k.program != 'counseling' AND k.status != 'exited'`).all()).results as Row[];
  const aliasRows = (await env.DB.prepare(`SELECT entity_id, raw_text FROM aliases WHERE entity='kid'`).all()).results as Row[];
  const aliasMap = new Map<number, string[]>();
  for (const a of aliasRows) aliasMap.set(a.entity_id, [...(aliasMap.get(a.entity_id) || []), a.raw_text]);
  return rows.map((r) => {
    const scored = kids.map((k) => {
      let s = nameScore(r.name_as_written, k.preferred_name && normalize(r.name_as_written).startsWith(normalize(k.preferred_name)) ? k.preferred_name : k.first_name, k.last_name, aliasMap.get(k.id) || []);
      if (k.site === site) s += 0.06;
      if (k.program === program) s += 0.04;
      return { k, s, aliases: aliasMap.get(k.id) || [] };
    }).sort((a, b) => b.s - a.s).slice(0, 5).filter((c, i) => i < 3 || c.s > 0.45);
    return { row: r, cands: scored };
  });
}

export async function read(env: Env, origin: string, sessionId: number): Promise<ReadResponse> {
  const s = await env.DB.prepare('SELECT * FROM sessions WHERE id=?').bind(sessionId).first<Row>();
  if (!s) throw new HttpError(404, 'no_session', 'That sheet does not exist.');
  if (s.read_json && s.status !== 'confirmed') { const cached = JSON.parse(s.read_json); if (cached.rows) return cached as ReadResponse; }
  if (s.status === 'confirmed') throw new HttpError(409, 'already_captured', `This sheet was already captured on ${md(s.captured_at || s.held_at)}.`);
  const { bytes, mime } = await photoBytes(env, origin, s);
  const tRead = Date.now();
  let readOut: SheetRead, source: ReadResponse['read_source'] = 'live', model = env.VISION_MODEL as string;
  const verified = VERIFIED_READS[s.photo_sha256];
  try {
    const r = await readSheet(env, bytes, mime, verified ? { primaryOnly: true, primaryTimeoutMs: 25000 } : {});
    readOut = r.read; model = r.model;
  } catch (e) {
    if (!verified) throw new HttpError(502, 'read_failed', "Couldn't read this sheet. Try a clearer photo, or type the names.");
    console.error('vision failed, using verified read', e);
    readOut = { header: verified.header, rows: verified.rows.map(({ row_index, name_as_written, mark }) => ({ row_index, name_as_written, mark })) };
    source = 'verified_fallback';
  }
  // Second look at every mark that is not a clear check: the Decisions API sees the photo and answers per row.
  const doubtful = readOut.rows.filter((r) => r.name_as_written.trim() && r.mark !== 'present');
  if (doubtful.length && source === 'live') {
    try {
      const ans = await decide(env, 'mark_check', { sheet: 'Attendance sheet with numbered rows and a HERE ✓ column on the right.', rows: doubtful.map((r) => ({ row: r.row_index, name: r.name_as_written })) },
        doubtful.map((r) => ({ type: 'choice' as const, name: `m${r.row_index}`, instructions: `Look closely at numbered row ${r.row_index} ("${r.name_as_written}") on the photo. What is in its HERE ✓ box at the right edge?`, choices: [
          { value: 'present', description: 'A complete check mark' }, { value: 'unclear', description: 'A partial, short, faint or half-finished mark' }, { value: 'absent', description: 'Empty, no ink at all' }] })),
        'Read the check marks on this attendance sheet photo.', `data:${mime};base64,${toBase64(bytes)}`);
      for (const r of doubtful) {
        const a = ans.get(`m${r.row_index}`);
        if (a && a.type === 'choice') {
          const pU = a.probabilities.find((x) => x.value === 'unclear')?.probability ?? 0;
          r.mark = pU >= 0.35 ? 'unclear' : (a.choice as Mark);
        }
      }
    } catch (e) { console.error('mark check failed', e); }
  }
  const readMs = Date.now() - tRead;
  const rows = readOut.rows.filter((r) => r.name_as_written.trim());
  const { site, conf: siteConf } = parseSite(readOut.header.site);
  const program = parseProgram(readOut.header.program);
  const heldAt = parseDate(readOut.header.date, env.DEMO_TODAY);
  const facName = normalize(readOut.header.facilitator).split(' ')[0];
  const mentors = (await env.DB.prepare('SELECT id, full_name FROM mentors').all()).results as Row[];
  const fac = mentors.find((m) => normalize(m.full_name).split(' ')[0] === facName) ?? null;

  // Name resolution: one Decisions request for the whole sheet
  const tMatch = Date.now();
  const blocks = await candidatesFor(env, rows, site, program);
  const questions = blocks.flatMap((b) => b.cands.map((c) => ({ type: 'predicate' as const, name: `r${b.row.row_index}_k${c.k.id}`,
    instructions: `Is the handwritten row R${b.row.row_index} ("${b.row.name_as_written}") the same child as enrolled kid K${c.k.id}? Consider nicknames, missing accents, abbreviations like "Rmz" for Ramírez, initials, and that this sheet is from ${site} ${program}. A different first name is a different child.` })));
  const data = {
    sheet: { site, program, date: heldAt, facilitator: readOut.header.facilitator },
    rows: blocks.map((b) => ({ id: `R${b.row.row_index}`, text: b.row.name_as_written })),
    candidates: [...new Map(blocks.flatMap((b) => b.cands.map((c) => [c.k.id, c.k]))).values()].map((k) => ({
      id: `K${k.id}`, name: `${k.first_name} ${k.last_name}`, nickname: k.preferred_name, school: k.school, grade: k.grade, program: k.program, site: k.site,
      also_written_as: (blocks.flatMap((b) => b.cands).find((c) => c.k.id === k.id)?.aliases || []).slice(0, 6),
    })),
  };
  let probs = new Map<string, number>();
  let decisionsOk = true;
  try {
    const ans = await decide(env, 'name_match', data, questions, 'A program manager photographed a paper attendance sheet. Match each handwritten row to an enrolled kid only when it is clearly the same child.');
    for (const [k, v] of ans) if (v.type === 'predicate') probs.set(k, v.probability);
  } catch (e) {
    console.error('decisions failed, using string similarity', e);
    decisionsOk = false;
    probs = new Map(blocks.flatMap((b) => b.cands.map((c) => [`r${b.row.row_index}_k${c.k.id}`, Math.min(0.97, Math.max(0, (c.s - 0.35) / 0.6))] as [string, number])));
  }
  const matchMs = Date.now() - tMatch;

  const boxes = verified?.rows ?? [];
  const outRows: ReadRow[] = blocks.map((b) => {
    const cands: Candidate[] = b.cands.map((c) => ({ kid_id: c.k.id, name: `${c.k.first_name} ${c.k.last_name}`, school: c.k.school, grade: c.k.grade, program: c.k.program, mentor: c.k.mentor, probability: Number((probs.get(`r${b.row.row_index}_k${c.k.id}`) ?? 0).toFixed(2)) }))
      .sort((a, b2) => b2.probability - a.probability);
    const best = cands[0] && cands[0].probability >= 0.5 ? { kid_id: cands[0].kid_id, probability: cands[0].probability } : null;
    const decision: ReadRow['decision'] = !best ? 'new' : best.probability >= 0.85 ? 'auto' : 'ask';
    const bestCand = best ? b.cands.find((c) => c.k.id === best.kid_id) : null;
    const newSpelling = !!bestCand && !bestCand.aliases.map(normalize).includes(normalize(b.row.name_as_written));
    return { row_index: b.row.row_index, raw_text: b.row.name_as_written, mark: b.row.mark as Mark, bbox: boxes.find((x) => x.row_index === b.row.row_index)?.bbox ?? null, candidates: cands.slice(0, 3), best, decision, new_spelling: newSpelling, mark_question: b.row.mark === 'unclear' };
  });

  // Preview of what saving will change (rules only, instant)
  const matched = outRows.filter((r) => r.best && r.decision === 'auto');
  const feats = await featuresFor(env, matched.map((r) => r.best!.kid_id));
  const openSev = new Map<number, Severity>(((await env.DB.prepare(`SELECT kid_id, severity FROM followups WHERE status='open'`).all()).results as Row[]).map((r) => [r.kid_id, r.severity]));
  const changes: ReadResponse['preview']['followup_changes'] = [];
  for (const f of feats) {
    const row = matched.find((r) => r.best!.kid_id === f.kid_id)!;
    if (row.mark !== 'absent' && !openSev.get(f.kid_id)) continue;
    const sessions = [...f.sessions, { date: heldAt, mark: row.mark }];
    let consecutive = 0; for (let i = sessions.length - 1; i >= 0; i--) { if (sessions[i].mark === 'absent') consecutive++; else if (sessions[i].mark === 'present') break; }
    const misses30 = sessions.filter((x) => x.mark === 'absent' && x.date > addDays(env.DEMO_TODAY, -30)).length;
    const to = ruleSeverity({ consecutive_misses: consecutive, misses_30d: misses30, last_contact: f.last_contact, sessions }, env.DEMO_TODAY);
    const from = openSev.get(f.kid_id) ?? null;
    if (to !== (from ?? 'fine')) changes.push({ kid_id: f.kid_id, kid_name: f.name, from, to });
  }
  const resp: ReadResponse = {
    session_id: sessionId, photo_url: s.photo_url,
    header: { program, site, held_at: heldAt, time: time12(program === 'mentoring' ? (site === 'Citrus Grove MS' ? '16:00' : '16:30') : '18:00'), facilitator: fac?.full_name ?? readOut.header.facilitator, facilitator_mentor_id: fac?.id ?? null, confidence: Number((siteConf * (fac ? 1 : 0.7)).toFixed(2)) },
    rows: outRows,
    timings: { upload_ms: 0, read_ms: readMs, match_ms: matchMs },
    read_source: source,
    models: { vision: source === 'live' ? model : 'verified copy', decisions: decisionsOk ? env.DECISIONS_MODEL : 'string similarity (offline)' },
    preview: { attendance: outRows.length, new_spellings: outRows.filter((r) => r.new_spelling).length, hours: program === 'mentoring' || program === 'workshop' ? 2 : 0, facilitator: fac?.full_name ?? readOut.header.facilitator, followup_changes: changes },
  };
  await env.DB.prepare(`UPDATE sessions SET program=?, site=?, held_at=?, facilitator_mentor_id=?, header_confidence=?, read_json=?, read_source=?, status='read' WHERE id=?`)
    .bind(program, site, heldAt, fac?.id ?? null, resp.header.confidence, JSON.stringify(resp), source, sessionId).run();
  await env.DB.prepare(`INSERT INTO activity (kind, text, bold, link, at) VALUES ('read', ?, ?, ?, ?)`)
    .bind(`Read ${outRows.length} names from the ${SITE_SHORT[site] ?? site} ${program} sheet`, `${outRows.length} names`, `/snap/${sessionId}`, nowISO(env)).run();
  return resp;
}

export async function confirm(env: Env, sessionId: number, body: ConfirmRequest): Promise<ConfirmResponse> {
  const t0 = Date.now();
  const s = await env.DB.prepare('SELECT * FROM sessions WHERE id=?').bind(sessionId).first<Row>();
  if (!s) throw new HttpError(404, 'no_session', 'That sheet does not exist.');
  if (s.status === 'confirmed') throw new HttpError(409, 'already_captured', `This sheet was already captured on ${md(s.captured_at || s.held_at)}.`);
  const read: ReadResponse | null = s.read_json ? JSON.parse(s.read_json) : null;
  const now = nowISO(env);
  const h = body.header;
  if (!h?.program || !h.site || !h.held_at) throw new HttpError(400, 'header', 'Program, site and date are required.');
  const startTime = h.program === 'mentoring' ? (h.site === 'Citrus Grove MS' ? '16:00' : '16:30') : h.program === 'workshop' ? '18:00' : '15:00';
  await env.DB.prepare(`UPDATE sessions SET program=?, site=?, held_at=?, start_time=?, facilitator_mentor_id=?, status='confirmed', captured_at=?, captured_by=? WHERE id=?`)
    .bind(h.program, h.site, h.held_at, startTime, h.facilitator_mentor_id, now, env.STAFF_NAME, sessionId).run();
  let present = 0, absent = 0, unclear = 0, aliases = 0, newKids = 0;
  const kidIds: number[] = [];
  const stmts: D1PreparedStatement[] = [];
  for (const r of body.rows) {
    const rr = read?.rows.find((x) => x.row_index === r.row_index);
    const raw = rr?.raw_text ?? '';
    const bbox = rr?.bbox ? JSON.stringify(rr.bbox) : null;
    if (r.action === 'skip') { stmts.push(env.DB.prepare(`INSERT INTO attendance (session_id, kid_id, raw_text, mark, row_index, bbox, match_probability, match_method, confirmed_at) VALUES (?,NULL,?,?,?,?,?, 'skipped', ?)`).bind(sessionId, raw, r.mark, r.row_index, bbox, rr?.best?.probability ?? null, now)); continue; }
    let kidId = r.kid_id;
    let method: 'auto' | 'staff' | 'new' = 'staff';
    if (r.action === 'new') {
      const first = r.new_kid?.first_name?.trim() || raw.split(' ')[0] || 'New';
      const last = r.new_kid?.last_name?.trim() || raw.split(' ').slice(1).join(' ') || '';
      const fam = await env.DB.prepare(`INSERT INTO families (household_name, primary_contact_name, relationship, language, neighborhood, created_from, created_at) VALUES (?, 'To be added', 'Guardian', 'en', ?, 'sheet', ?)`).bind(last || first, h.site === 'West Little River CC' ? 'West Little River' : 'Little Havana', now).run();
      const k = await env.DB.prepare(`INSERT INTO kids (family_id, first_name, last_name, school, grade, program, site, enrolled_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(fam.meta.last_row_id, first, last, h.site === 'Citrus Grove MS' ? 'Citrus Grove MS' : '', '', h.program, h.site, h.held_at, now).run();
      kidId = Number(k.meta.last_row_id); method = 'new'; newKids++;
      await env.DB.prepare(`INSERT INTO activity (kind, text, bold, link, at) VALUES ('signup', ?, ?, ?, ?)`).bind(`New kid from the sheet: ${first} ${last}. Family details to add.`, `${first} ${last}`, `/people/kids/${kidId}`, now).run();
    } else if (rr?.best && rr.best.kid_id === kidId && rr.best.probability >= 0.85) method = 'auto';
    if (!kidId) continue;
    kidIds.push(kidId);
    if (r.mark === 'present') present++; else if (r.mark === 'absent') absent++; else unclear++;
    const prob = rr?.candidates.find((c) => c.kid_id === kidId)?.probability ?? (method === 'new' ? 1 : null);
    stmts.push(env.DB.prepare(`INSERT INTO attendance (session_id, kid_id, raw_text, mark, row_index, bbox, match_probability, match_method, confirmed_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(sessionId, kidId, raw, r.mark, r.row_index, bbox, prob, method, now));
    if (raw) {
      const n = normalize(raw);
      const exists = await env.DB.prepare(`SELECT 1 FROM aliases WHERE entity='kid' AND entity_id=? AND normalized=?`).bind(kidId, n).first();
      if (!exists) { aliases++; stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO aliases (entity, entity_id, raw_text, normalized, source, source_ref, probability, first_seen_at) VALUES ('kid',?,?,?,'sheet',?,?,?)`).bind(kidId, raw, n, `session:${sessionId}:${r.row_index}`, prob, now)); }
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  // Hours for the person who ran the session, deduped per mentor/date/site/program
  let hoursLogged = 0;
  if (h.facilitator_mentor_id && h.program !== 'counseling') {
    const key = `${h.facilitator_mentor_id}|${h.held_at}|${SITE_KEY[h.site] ?? h.site}|${h.program}`;
    const prior = await env.DB.prepare(`SELECT id FROM hours WHERE dedupe_key=? AND superseded_by IS NULL ORDER BY id LIMIT 1`).bind(key).first<Row>();
    await env.DB.prepare(`INSERT INTO hours (mentor_id, session_id, held_on, site, program, hours, reported_at, source, raw_text, dedupe_key, superseded_by, note) VALUES (?,?,?,?,?,?,?, 'sheet', NULL, ?, ?, ?)`)
      .bind(h.facilitator_mentor_id, sessionId, h.held_at, h.site, h.program, h.program === 'workshop' ? 2.5 : 2.0, now, key, prior?.id ?? null, prior ? 'Reported twice, counted once' : null).run();
    hoursLogged = prior ? 0 : h.program === 'workshop' ? 2.5 : 2.0;
  }
  const fu = await refreshFollowups(env, [...new Set(kidIds)]);
  await env.DB.prepare(`INSERT INTO activity (kind, text, bold, link, at) VALUES ('alias', ?, ?, ?, ?)`)
    .bind(`Saved ${present + absent + unclear} lines from ${SITE_SHORT[h.site] ?? h.site}. Learned ${aliases} new spelling${aliases === 1 ? '' : 's'}.`, `${aliases} new spelling${aliases === 1 ? '' : 's'}`, `/report?ev=session:${sessionId}`, now).run();
  return { session_id: sessionId, attendance_written: present + absent + unclear, present, absent, unclear, aliases_learned: aliases, hours_logged: hoursLogged, new_kids: newKids, followups: { created: fu.created, updated: fu.updated }, ms: Date.now() - t0 };
}

export async function samples(env: Env) {
  const rows = (await env.DB.prepare(`SELECT id, photo_sha256, status FROM sessions WHERE photo_sha256 IS NOT NULL`).all()).results as Row[];
  return SAMPLES.map((s) => {
    const hit = rows.find((r) => r.photo_sha256 === s.photo_sha256 && r.status === 'confirmed');
    return { key: s.key, label: s.label, site: s.site, program: s.program, held_at: s.held_at, time: s.time, photo_url: s.photo_url, already_captured: !!hit, session_id: hit?.id ?? null, recommended: s.recommended && !hit };
  });
}
