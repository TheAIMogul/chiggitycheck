import { HttpError, type Env } from './util';

export type TesterForm = {
  name: string; email: string; organization: string; role?: string; org_type?: string;
  people_served?: string; phone?: string; notes?: string; website?: string; // website = honeypot
};

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export async function join(env: Env, body: TesterForm) {
  const f = {
    name: clip(body.name, 120), email: clip(body.email, 200).toLowerCase(), organization: clip(body.organization, 160),
    role: clip(body.role, 120), org_type: clip(body.org_type, 40), people_served: clip(body.people_served, 40),
    phone: clip(body.phone, 40), notes: clip(body.notes, 2000),
  };
  if (clip(body.website, 200)) return { ok: true, position: 0, returning: false }; // bot filled the hidden field
  if (!f.name || !f.organization) throw new HttpError(400, 'missing', 'Please add your name and organization.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) throw new HttpError(400, 'email', 'That email address doesn\'t look right.');
  const existing = await env.DB.prepare('SELECT id FROM early_testers WHERE email=?').bind(f.email).first<{ id: number }>();
  await env.DB.prepare(
    `INSERT INTO early_testers (name,email,organization,role,org_type,people_served,phone,notes) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET name=excluded.name, organization=excluded.organization, role=excluded.role, org_type=excluded.org_type,
       people_served=excluded.people_served, phone=excluded.phone, notes=excluded.notes, updated_at=datetime('now')`,
  ).bind(f.name, f.email, f.organization, f.role || null, f.org_type || null, f.people_served || null, f.phone || null, f.notes || null).run();
  const row = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM early_testers WHERE id <= t.id) pos FROM early_testers t WHERE email=?').bind(f.email).first<{ pos: number }>();
  return { ok: true, position: row?.pos ?? 0, returning: !!existing };
}

export async function count(env: Env) {
  const r = await env.DB.prepare('SELECT COUNT(*) n FROM early_testers').first<{ n: number }>();
  return { count: r?.n ?? 0 };
}
