import { Hono, type Context } from 'hono';
import type { ConfirmRequest, FollowupItem, Lang, Mark } from '../shared/types';
import { SEED_STATEMENTS } from './seed/seed-sql';
import { refreshFollowups, draftMessage, featuresFor } from './lib/followups';
import * as edits from './lib/edits';
import * as integrations from './lib/integrations';
import * as messaging from './lib/messaging';
import { buildScenario, listScenarios, sheetSvg } from './lib/scenario';
import * as sheets from './lib/sheets';
import * as signups from './lib/signups';
import { type Env, HttpError, nowISO } from './lib/util';
import * as views from './lib/views';

type App = { Bindings: Env };
const app = new Hono<App>();

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
  console.error(err);
  return c.json({ error: { code: 'server_error', message: 'Something went wrong on our side. Try again.' } }, 500);
});
const origin = (c: Context<App>) => new URL(c.req.url).origin;
const fu = async (env: Env, id: number): Promise<FollowupItem> => {
  const [item] = await views.followupItems(env, 'fu.id=?', id);
  if (!item) throw new HttpError(404, 'no_followup', 'That follow-up does not exist.');
  return item;
};

/* ---------- Today ---------- */
app.get('/api/week', async (c) => c.json(await views.week(c.env)));

/* ---------- Snap ---------- */
app.get('/api/sheets/samples', async (c) => c.json(await sheets.samples(c.env)));
app.post('/api/sheets/samples/:key/capture', async (c) => c.json(await sheets.captureSample(c.env, origin(c), c.req.param('key'))));
app.post('/api/sheets/upload', async (c) => {
  const form = await c.req.formData();
  return c.json(await sheets.upload(c.env, form.get('photo') as unknown as File));
});
app.post('/api/sheets/:id/read', async (c) => c.json(await sheets.read(c.env, origin(c), Number(c.req.param('id')))));
app.post('/api/sheets/:id/confirm', async (c) => c.json(await sheets.confirm(c.env, Number(c.req.param('id')), await c.req.json<ConfirmRequest>())));
app.get('/api/sheets/:id/image.svg', async (c) => c.body(await sheetSvg(c.env, Number(c.req.param('id'))), 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300' }));
app.get('/api/photos/*', async (c) => {
  const key = c.req.path.replace('/api/photos/', '');
  const o = await c.env.PHOTOS.get(key);
  if (!o) return c.json({ error: { code: 'not_found', message: 'Photo not found' } }, 404);
  return new Response(o.body, { headers: { 'Content-Type': o.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'private, max-age=86400' } });
});

/* ---------- Calls ---------- */
app.get('/api/calls', async (c) => {
  const status = c.req.query('status') || 'open';
  const where: Record<string, string> = {
    open: `fu.status='open' AND fu.severity IN ('call','urgent')`,
    watch: `fu.status='open' AND fu.severity='watch'`,
    sent: `fu.status='sent'`,
    replied: `fu.status IN ('replied','closed') AND fu.severity IN ('call','urgent')`,
  };
  const counts = (await c.env.DB.prepare(`SELECT
      SUM(status='open' AND severity IN ('call','urgent')) open, SUM(status='sent') sent,
      SUM(status IN ('replied','closed') AND severity IN ('call','urgent')) replied, SUM(status='open' AND severity='watch') watch FROM followups`).first()) as Record<string, number>;
  let items = await views.followupItems(c.env, where[status] ?? where.open);
  if (status === 'replied' || status === 'sent') items = items.sort((a, b) => (b.replied_at || b.sent_at || '').localeCompare(a.replied_at || a.sent_at || ''));
  return c.json({ counts: { open: counts.open ?? 0, sent: counts.sent ?? 0, replied: counts.replied ?? 0, watch: counts.watch ?? 0 }, items });
});
app.get('/api/followups/:id', async (c) => c.json(await fu(c.env, Number(c.req.param('id')))));
app.post('/api/followups/:id/send', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ channel?: 'whatsapp' | 'sms' }>().catch(() => ({} as { channel?: 'whatsapp' | 'sms' }));
  await messaging.send(c.env, c.executionCtx, id, body.channel === 'sms' ? 'sms' : 'whatsapp');
  return c.json(await fu(c.env, id));
});
app.post('/api/followups/:id/called', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ note?: string }>().catch(() => ({} as { note?: string }));
  await messaging.markCalled(c.env, id, body.note);
  return c.json(await fu(c.env, id));
});
app.post('/api/followups/:id/replied', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ body?: string }>().catch(() => ({} as { body?: string }));
  await messaging.markReplied(c.env, id, body.body);
  return c.json(await fu(c.env, id));
});
app.post('/api/followups/:id/not-needed', async (c) => { const id = Number(c.req.param('id')); await messaging.markNotNeeded(c.env, id); return c.json(await fu(c.env, id)); });
app.post('/api/followups/:id/regenerate', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ language?: Lang }>().catch(() => ({} as { language?: Lang }));
  const row = await c.env.DB.prepare('SELECT kid_id, language, facts_json FROM followups WHERE id=?').bind(id).first<Record<string, any>>();
  if (!row) throw new HttpError(404, 'no_followup', 'That follow-up does not exist.');
  const [f] = await featuresFor(c.env, [row.kid_id]);
  const lang = (body.language || row.language) as Lang;
  const d = await draftMessage(c.env, f, lang);
  const facts = JSON.parse(row.facts_json || '[]');
  await c.env.DB.prepare('UPDATE followups SET draft_text=?, draft_translation=?, language=?, facts_json=?, updated_at=? WHERE id=?')
    .bind(d.message, d.english, lang, JSON.stringify({ facts: Array.isArray(facts) ? facts : facts.facts, highlights: d.highlights }), nowISO(c.env), id).run();
  return c.json(await fu(c.env, id));
});
app.patch('/api/followups/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const { draft_text } = await c.req.json<{ draft_text: string }>();
  if (!draft_text?.trim()) throw new HttpError(400, 'empty', 'The message is empty.');
  await c.env.DB.prepare('UPDATE followups SET draft_text=?, draft_translation=NULL, updated_at=? WHERE id=?').bind(draft_text.trim(), nowISO(c.env), id).run();
  return c.json(await fu(c.env, id));
});

/* ---------- People ---------- */
app.get('/api/kids', async (c) => c.json(await views.kidList(c.env, { q: c.req.query('q'), program: c.req.query('program'), site: c.req.query('site'), flag: c.req.query('flag') })));
app.get('/api/kids/:id', async (c) => { const k = await views.kidDetail(c.env, Number(c.req.param('id'))); if (!k) throw new HttpError(404, 'no_kid', 'No such kid.'); return c.json(k); });
app.get('/api/families', async (c) => c.json(await views.familyList(c.env)));
app.get('/api/families/:id', async (c) => { const f = await views.familyDetail(c.env, Number(c.req.param('id'))); if (!f) throw new HttpError(404, 'no_family', 'No such family.'); return c.json(f); });
app.get('/api/mentors', async (c) => c.json(await views.mentorList(c.env)));
app.get('/api/mentors/:id', async (c) => { const m = await views.mentorDetail(c.env, Number(c.req.param('id'))); if (!m) throw new HttpError(404, 'no_mentor', 'No such mentor.'); return c.json(m); });
app.get('/api/signups', async (c) => c.json(await views.signupList(c.env)));
app.post('/api/signups', async (c) => c.json(await signups.submit(c.env, await c.req.json())));
app.post('/api/import', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file') as unknown as File | null;
  if (!file) throw new HttpError(400, 'no_file', 'Attach a CSV file.');
  return c.json(await signups.importCsv(c.env, await file.text()));
});
app.get('/api/search', async (c) => c.json(await views.search(c.env, c.req.query('q') || '')));

/* ---------- Live edits ---------- */
app.get('/api/live', async (c) => c.json(await edits.liveSummary(c.env)));
app.patch('/api/attendance/:id', async (c) => { const { mark } = await c.req.json<{ mark: Mark }>(); return c.json(await edits.editAttendance(c.env, Number(c.req.param('id')), mark)); });
app.patch('/api/sessions/:id/attendance', async (c) => { const b = await c.req.json<{ kid_id: number; mark: Mark }>(); return c.json(await edits.addAttendance(c.env, Number(c.req.param('id')), Number(b.kid_id), b.mark)); });
app.patch('/api/kids/:id', async (c) => c.json(await edits.editKid(c.env, Number(c.req.param('id')), await c.req.json())));
app.patch('/api/families/:id', async (c) => c.json(await edits.editFamily(c.env, Number(c.req.param('id')), await c.req.json())));

/* ---------- Report ---------- */
app.get('/api/report', async (c) => {
  const q = c.req.query('quarter') || 'FY27Q1';
  if (q !== 'FY27Q1') throw new HttpError(404, 'no_quarter', 'Only Q1 FY2027 is in ChiggityCheck. Earlier quarters were kept in spreadsheets.');
  return c.json(await views.report(c.env));
});
app.get('/api/report/evidence/:ref', async (c) => {
  const ref = decodeURIComponent(c.req.param('ref'));
  if (ref.startsWith('session:')) {
    const id = Number(ref.split(':')[1]);
    const s = await c.env.DB.prepare(`SELECT s.*, m.full_name fac FROM sessions s LEFT JOIN mentors m ON m.id=s.facilitator_mentor_id WHERE s.id=?`).bind(id).first<Record<string, any>>();
    if (!s) throw new HttpError(404, 'no_session', 'No such sheet.');
    const rows = (await c.env.DB.prepare(`SELECT a.*, k.first_name, k.last_name FROM attendance a LEFT JOIN kids k ON k.id=a.kid_id WHERE a.session_id=? ORDER BY a.row_index`).bind(id).all()).results as Record<string, any>[];
    const p = rows.filter((r) => r.mark === 'present').length, a = rows.filter((r) => r.mark === 'absent').length, u = rows.filter((r) => r.mark === 'unclear').length;
    return c.json({ ref, title: `${s.site} · ${s.held_at}`, value: `${rows.length} lines`, formula: `${p} here · ${a} missed · ${u} unclear. Captured ${String(s.captured_at || '').slice(0, 16).replace('T', ' ')} by ${s.captured_by || 'staff'}.`, summary: '',
      sessions: [{ session_id: id, held_at: s.held_at, site: s.site, program: s.program, facilitator: s.fac, present: p, absent: a, unclear: u, rate: p + a ? Math.round((p / (p + a)) * 1000) / 10 : null, photo_url: s.photo_url }],
      records: rows.map((r) => ({ session_id: id, held_at: s.held_at, site: s.site, row_index: r.row_index, raw_text: r.raw_text, mark: r.mark, kid_name: r.first_name ? `${r.first_name} ${r.last_name}` : null, probability: r.match_probability, photo_url: s.photo_url, bbox: r.bbox ? JSON.parse(r.bbox) : null, confirmed_at: r.confirmed_at })) });
  }
  return c.json(await views.evidence(c.env, ref));
});
app.post('/api/report/snapshot', async (c) => {
  const r = await views.report(c.env);
  const built = nowISO(c.env);
  const ins = await c.env.DB.prepare(`INSERT INTO report_snapshots (quarter_label, period_start, period_end, json, built_at) VALUES ('FY27Q1', ?, ?, ?, ?)`).bind(r.period.start, r.period.end, JSON.stringify(r), built).run();
  return c.json({ id: Number(ins.meta.last_row_id), built_at: built });
});

/* ---------- Integrations & exports ---------- */
app.get('/api/integrations', async (c) => c.json(await integrations.list(c.env)));
app.post('/api/integrations/:key/:verb', async (c) => c.json(await integrations.action(c.env, c.req.param('key'), c.req.param('verb'))));
app.get('/api/export/:name', async (c) => {
  const f = await integrations.exportFile(c.env, c.req.param('name'));
  return c.body(f.body, 200, { 'Content-Type': `${f.type}; charset=utf-8`, 'Content-Disposition': `attachment; filename="${f.filename}"` });
});
app.get('/api/calendar.ics', async (c) => c.body(await integrations.calendar(c.env), 200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="tidepath-sessions.ics"' }));

/* ---------- Dataset builder ---------- */
app.get('/api/scenarios', async (c) => c.json(await listScenarios(c.env)));
app.post('/api/scenarios', async (c) => { const { prompt } = await c.req.json<{ prompt: string }>(); return c.json(await buildScenario(c.env, prompt)); });

/* ---------- Demo & about ---------- */
app.post('/api/demo/reset', async (c) => {
  const t0 = Date.now();
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM scenarios'), ...SEED_STATEMENTS.map((s) => c.env.DB.prepare(s))]);
  const counts = (await c.env.DB.prepare(`SELECT (SELECT COUNT(*) FROM kids) kids, (SELECT COUNT(*) FROM families) families, (SELECT COUNT(*) FROM sessions) sessions, (SELECT COUNT(*) FROM attendance) attendance, (SELECT COUNT(*) FROM hours) hours, (SELECT COUNT(*) FROM signups) signups`).first()) as Record<string, number>;
  return c.json({ ok: true, ms: Date.now() - t0, seeded: counts });
});
app.get('/api/about', async (c) => {
  const ai = (await c.env.DB.prepare(`SELECT COUNT(*) n, COALESCE(SUM(cost_usd),0) usd FROM ai_calls`).first()) as Record<string, number>;
  const counts = (await c.env.DB.prepare(`SELECT (SELECT COUNT(*) FROM kids WHERE program!='counseling') kids, (SELECT COUNT(*) FROM families) families, (SELECT COUNT(*) FROM mentors) mentors, (SELECT COUNT(*) FROM sessions) sessions, (SELECT COUNT(*) FROM attendance) attendance_lines, (SELECT COUNT(*) FROM aliases) spellings, (SELECT COUNT(*) FROM messages) messages`).first()) as Record<string, number>;
  return c.json({ models: { vision: c.env.VISION_MODEL, vision_fallback: c.env.VISION_FALLBACK_MODEL, decisions: c.env.DECISIONS_MODEL, drafting: c.env.DRAFT_MODEL }, ai_gateway: c.env.AI_GATEWAY_ID, ai_spend_usd: Math.round(ai.usd * 10000) / 10000, ai_calls: ai.n, counts, today: c.env.DEMO_TODAY, repo: 'https://github.com/TheAIMogul/chiggitycheck' });
});
app.get('/api/health', (c) => c.json({ ok: true, today: c.env.DEMO_TODAY }));
app.all('/api/*', (c) => c.json({ error: { code: 'not_found', message: 'No such endpoint.' } }, 404));

export default {
  fetch: app.fetch,
  // 6am Miami: re-score every active kid and send stale follow-ups back to the call list
  async scheduled(_e: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      await messaging.nudgeStale(env);
      const ids = ((await env.DB.prepare(`SELECT id FROM kids WHERE status!='exited' AND program!='counseling'`).all()).results as { id: number }[]).map((r) => r.id);
      await refreshFollowups(env, ids, { draft: true });
    })());
  },
} satisfies ExportedHandler<Env>;
