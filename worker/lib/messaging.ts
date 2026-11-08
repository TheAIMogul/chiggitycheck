// Channel provider for follow-up messages. Provider = sandbox that mirrors the WhatsApp Business Cloud API lifecycle:
// a wamid message id, then sent → delivered → read status webhooks, and (sandbox only) a simulated parent reply.
// Nothing leaves this system: no real phone receives these messages.
import type { Lang } from '../../shared/types';
import { respond } from './ai';
import { type Env, HttpError, nowISO, LANG_NAME } from './util';

type Row = Record<string, any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function event(env: Env, messageId: number, status: string, payload: object = {}) {
  const at = nowISO(env);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO message_events (message_id, status, payload, at) VALUES (?,?,?,?)`).bind(messageId, status, JSON.stringify(payload), at),
    env.DB.prepare(`UPDATE messages SET status=?, updated_at=? WHERE id=?`).bind(status, at, messageId),
  ]);
}

export async function send(env: Env, ctx: { waitUntil(p: Promise<unknown>): void }, followupId: number, channel: 'whatsapp' | 'sms') {
  const fu = await env.DB.prepare(`SELECT fu.*, f.phone, f.primary_contact_name, f.language AS flang, k.first_name FROM followups fu JOIN families f ON f.id=fu.family_id JOIN kids k ON k.id=fu.kid_id WHERE fu.id=?`).bind(followupId).first<Row>();
  if (!fu) throw new HttpError(404, 'no_followup', 'That follow-up does not exist.');
  if (!fu.draft_text) throw new HttpError(400, 'no_draft', 'There is no message to send yet.');
  if (fu.status === 'sent' || fu.status === 'replied') throw new HttpError(409, 'already_sent', 'This message was already sent.');
  const now = nowISO(env);
  const wamid = `wamid.HBgL${crypto.randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
  const r = await env.DB.prepare(`INSERT INTO messages (followup_id, family_id, channel, direction, to_number, body, provider, provider_message_id, status, created_at, updated_at) VALUES (?,?,?, 'out', ?,?,?,?, 'queued', ?, ?)`)
    .bind(followupId, fu.family_id, channel, fu.phone, fu.draft_text, channel === 'whatsapp' ? 'whatsapp_sandbox' : 'sms_sandbox', channel === 'whatsapp' ? wamid : `SM${wamid.slice(10, 42)}`, now, now).run();
  const mid = Number(r.meta.last_row_id);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO message_events (message_id, status, payload, at) VALUES (?, 'queued', '{}', ?)`).bind(mid, now),
    env.DB.prepare(`UPDATE followups SET status='sent', sent_at=?, updated_at=? WHERE id=?`).bind(now, now, followupId),
    env.DB.prepare(`INSERT INTO activity (kind, text, bold, link, at) VALUES ('send', ?, ?, ?, ?)`).bind(`Sent ${fu.first_name}'s family a ${LANG_NAME[fu.language] ?? ''} message on ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`, `${fu.first_name}'s family`, `/calls/${followupId}`, now),
    env.DB.prepare(`UPDATE integrations SET last_sync_at=? WHERE key=?`).bind(now, channel),
  ]);
  // Status webhooks, the way the provider delivers them
  ctx.waitUntil((async () => {
    await sleep(1200); await event(env, mid, 'sent', { conversation: { origin: { type: 'utility' } } });
    await sleep(1800); await event(env, mid, 'delivered');
    await sleep(4500); await event(env, mid, 'read');
    await sleep(3500);
    try { await simulateReply(env, followupId, mid, fu); } catch (e) { console.error('sandbox reply failed', e); }
  })());
  return mid;
}

async function simulateReply(env: Env, followupId: number, outId: number, fu: Row) {
  const still = await env.DB.prepare(`SELECT status FROM followups WHERE id=?`).bind(followupId).first<Row>();
  if (!still || still.status !== 'sent') return;
  const lang = (fu.flang || fu.language || 'en') as Lang;
  const raw = await respond(env, 'sandbox_reply', {
    instructions: `You play ${fu.primary_contact_name}, the parent of ${fu.first_name}, replying on WhatsApp to a message from their kid's youth program. Write a short, natural reply (1 to 2 sentences) in ${LANG_NAME[lang]}${lang === 'ht' ? ' (Kreyòl ayisyen)' : ''}, the way a busy parent texts. Give one ordinary, believable reason for the missed sessions (for example illness, transportation, a schedule change) and say the kid will come to the next session. Do not mention being an AI. Return JSON.`,
    input: `Message received: ${fu.draft_text}`,
    schema: { name: 'reply', schema: { type: 'object', additionalProperties: false, required: ['reply', 'english'], properties: { reply: { type: 'string' }, english: { type: 'string' } } } },
    effort: 'none', timeoutMs: 20000,
  });
  const j = JSON.parse(raw) as { reply: string; english: string };
  const now = nowISO(env);
  const r = await env.DB.prepare(`INSERT INTO messages (followup_id, family_id, channel, direction, to_number, body, provider, provider_message_id, status, created_at, updated_at) VALUES (?,?, 'whatsapp', 'in', NULL, ?, 'whatsapp_sandbox', ?, 'received', ?, ?)`)
    .bind(followupId, fu.family_id, j.reply, `wamid.IN${crypto.randomUUID().replace(/-/g, '').slice(0, 18).toUpperCase()}`, now, now).run();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO message_events (message_id, status, payload, at) VALUES (?, 'received', ?, ?)`).bind(r.meta.last_row_id, JSON.stringify({ english: j.english, simulated: true }), now),
    env.DB.prepare(`UPDATE followups SET status='replied', replied_at=?, updated_at=? WHERE id=?`).bind(now, now, followupId),
    env.DB.prepare(`INSERT INTO contacts (family_id, kid_id, followup_id, kind, body, happened_at) VALUES (?,?,?, 'reply', ?, ?)`).bind(fu.family_id, fu.kid_id, followupId, lang === 'en' ? j.reply : `${j.reply} (${j.english})`, now),
    env.DB.prepare(`INSERT INTO activity (kind, text, bold, link, at) VALUES ('reply', ?, 'replied', ?, ?)`).bind(`${fu.primary_contact_name.split(' ')[0]} replied on WhatsApp about ${fu.first_name}`, `/calls/${followupId}`, now),
  ]);
  void outId;
}

export async function markCalled(env: Env, followupId: number, note?: string) {
  const fu = await env.DB.prepare(`SELECT * FROM followups WHERE id=?`).bind(followupId).first<Row>();
  if (!fu) throw new HttpError(404, 'no_followup', 'That follow-up does not exist.');
  const now = nowISO(env);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO contacts (family_id, kid_id, followup_id, kind, body, happened_at) VALUES (?,?,?, 'call', ?, ?)`).bind(fu.family_id, fu.kid_id, followupId, note || 'Called the family.', now),
    env.DB.prepare(`UPDATE followups SET status='closed', closed_at=?, updated_at=? WHERE id=?`).bind(now, now, followupId),
  ]);
}

export async function markReplied(env: Env, followupId: number, body?: string) {
  const fu = await env.DB.prepare(`SELECT * FROM followups WHERE id=?`).bind(followupId).first<Row>();
  if (!fu) throw new HttpError(404, 'no_followup', 'That follow-up does not exist.');
  const now = nowISO(env);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO contacts (family_id, kid_id, followup_id, kind, body, happened_at) VALUES (?,?,?, 'reply', ?, ?)`).bind(fu.family_id, fu.kid_id, followupId, body || 'Family replied (logged by staff).', now),
    env.DB.prepare(`UPDATE followups SET status='replied', replied_at=?, updated_at=? WHERE id=?`).bind(now, now, followupId),
  ]);
}

export async function markNotNeeded(env: Env, followupId: number) {
  const now = nowISO(env);
  await env.DB.prepare(`UPDATE followups SET status='not_needed', closed_at=?, updated_at=? WHERE id=?`).bind(now, now, followupId).run();
}

/** Nightly nudge: sent more than 3 days ago with no reply → back to the call list. */
export async function nudgeStale(env: Env) {
  const cutoff = new Date(new Date(env.DEMO_TODAY + 'T12:00:00Z').getTime() - 3 * 86400000).toISOString().slice(0, 10);
  const stale = (await env.DB.prepare(`SELECT id FROM followups WHERE status='sent' AND sent_at < ?`).bind(cutoff).all()).results as Row[];
  for (const s of stale) await env.DB.prepare(`UPDATE followups SET status='open', updated_at=? WHERE id=?`).bind(nowISO(env), s.id).run();
  return stale.length;
}
