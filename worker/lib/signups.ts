// Sign-up resolution: every web-form submission (or imported spreadsheet row) is matched to existing families and kids
// before it is saved, so the same mother never ends up on three lists.
import type { ImportResult, Lang, SignupForm, SignupResult } from '../../shared/types';
import { decide } from './ai';
import { type Env, HttpError, nameScore, normalize, nowISO } from './util';

type Row = Record<string, any>;
const digits = (s: string | null | undefined) => String(s || '').replace(/\D/g, '').slice(-10);

async function resolveMany(env: Env, forms: SignupForm[]) {
  const fams = (await env.DB.prepare(`SELECT f.id, f.household_name, f.primary_contact_name, f.phone, f.language, f.neighborhood FROM families f`).all()).results as Row[];
  const kids = (await env.DB.prepare(`SELECT id, family_id, first_name, last_name, preferred_name, grade, school FROM kids WHERE program!='counseling'`).all()).results as Row[];
  const famAliases = (await env.DB.prepare(`SELECT entity_id, raw_text FROM aliases WHERE entity='family'`).all()).results as Row[];
  const blocks = forms.map((f, i) => {
    const g = `${f.guardian_first} ${f.guardian_last}`.trim();
    const fc = fams.map((x) => {
      const al = famAliases.filter((a) => a.entity_id === x.id).map((a) => a.raw_text);
      let s = nameScore(g, x.primary_contact_name.split(' ')[0], x.primary_contact_name.split(' ').slice(1).join(' '), al);
      if (digits(f.phone) && digits(f.phone) === digits(x.phone)) s += 0.3;
      if (normalize(f.kid_last).replace(/ /g, '') === normalize(x.household_name).replace(/ /g, '')) s += 0.1;
      return { x, s, al };
    }).sort((a, b) => b.s - a.s).slice(0, 3);
    const kc = kids.map((k) => ({ k, s: nameScore(`${f.kid_first} ${f.kid_last}`, f.kid_first.length <= 4 && k.preferred_name ? k.preferred_name : k.first_name, k.last_name) })).sort((a, b) => b.s - a.s).slice(0, 3);
    return { i, f, g, fc, kc };
  });
  const questions = blocks.flatMap((b) => [
    ...b.fc.map((c) => ({ type: 'predicate' as const, name: `s${b.i}_f${c.x.id}`, instructions: `Is the guardian on sign-up S${b.i} the same person as the guardian of existing family F${c.x.id}? Consider hyphens, missing accents, initials, nicknames and matching phone numbers.` })),
    ...b.kc.map((c) => ({ type: 'predicate' as const, name: `s${b.i}_k${c.k.id}`, instructions: `Is the child on sign-up S${b.i} the same child as enrolled kid K${c.k.id}? A nickname (Josh/Joshua) can be the same child; a sibling with a different first name is not.` })),
  ]);
  const data = {
    signups: blocks.map((b) => ({ id: `S${b.i}`, guardian: b.g, phone: b.f.phone, language: b.f.language, kid: `${b.f.kid_first} ${b.f.kid_last}`, grade: b.f.grade, school: b.f.school })),
    families: [...new Map(blocks.flatMap((b) => b.fc.map((c) => [c.x.id, c]))).values()].map((c) => ({ id: `F${c.x.id}`, guardian: c.x.primary_contact_name, also_written_as: c.al.slice(0, 5), phone: c.x.phone, household: c.x.household_name, language: c.x.language })),
    kids: [...new Map(blocks.flatMap((b) => b.kc.map((c) => [c.k.id, c.k]))).values()].map((k) => ({ id: `K${k.id}`, name: `${k.first_name} ${k.last_name}`, nickname: k.preferred_name, grade: k.grade, school: k.school, family: `F${k.family_id}` })),
  };
  let probs = new Map<string, number>();
  try {
    const ans = await decide(env, 'signup_match', data, questions, 'A youth program receives sign-ups from a web form. Decide which ones are families and kids it already serves.');
    for (const [k, v] of ans) if (v.type === 'predicate') probs.set(k, v.probability);
  } catch (e) {
    console.error('decisions failed for signups, using similarity', e);
    for (const b of blocks) { for (const c of b.fc) probs.set(`s${b.i}_f${c.x.id}`, Math.min(0.97, c.s)); for (const c of b.kc) probs.set(`s${b.i}_k${c.k.id}`, Math.min(0.97, c.s)); }
  }
  return blocks.map((b) => {
    const fam = b.fc.map((c) => ({ c, p: probs.get(`s${b.i}_f${c.x.id}`) ?? 0 })).sort((a, z) => z.p - a.p)[0];
    const kid = b.kc.map((c) => ({ c, p: probs.get(`s${b.i}_k${c.k.id}`) ?? 0 })).sort((a, z) => z.p - a.p)[0];
    return { b, fam, kid };
  });
}

async function save(env: Env, source: string, res: Awaited<ReturnType<typeof resolveMany>>[number]): Promise<SignupResult> {
  const t0 = Date.now();
  const { b, fam, kid } = res;
  const f = b.f;
  const now = nowISO(env);
  let familyId: number, familyName: string, existingFam = false, kidId: number, kidName = `${f.kid_first} ${f.kid_last}`, existingKid = false;
  const famP = fam?.p ?? 0;
  if (fam && famP >= 0.85) {
    familyId = fam.c.x.id; familyName = fam.c.x.household_name; existingFam = true;
    await env.DB.prepare(`INSERT OR IGNORE INTO aliases (entity, entity_id, raw_text, normalized, source, probability, first_seen_at) VALUES ('family',?,?,?,'form',?,?)`).bind(familyId, b.g, normalize(b.g), famP, now).run();
  } else {
    const r = await env.DB.prepare(`INSERT INTO families (household_name, primary_contact_name, relationship, phone, email, language, neighborhood, created_from, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(f.kid_last || f.guardian_last, b.g, 'Parent', f.phone, f.email ?? null, f.language, f.neighborhood ?? null, source, now).run();
    familyId = Number(r.meta.last_row_id); familyName = f.kid_last || f.guardian_last;
    await env.DB.prepare(`INSERT OR IGNORE INTO aliases (entity, entity_id, raw_text, normalized, source, probability, first_seen_at) VALUES ('family',?,?,?,'form',1,?)`).bind(familyId, b.g, normalize(b.g), now).run();
  }
  const kidP = kid?.p ?? 0;
  if (kid && kidP >= 0.85 && (!existingFam || kid.c.k.family_id === familyId)) {
    kidId = kid.c.k.id; kidName = `${kid.c.k.first_name} ${kid.c.k.last_name}`; existingKid = true;
  } else {
    const r = await env.DB.prepare(`INSERT INTO kids (family_id, first_name, last_name, school, grade, program, site, enrolled_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(familyId, f.kid_first, f.kid_last, f.school, f.grade, f.program, f.neighborhood?.toLowerCase().includes('river') ? 'West Little River CC' : 'Citrus Grove MS', env.DEMO_TODAY, now).run();
    kidId = Number(r.meta.last_row_id);
  }
  await env.DB.prepare(`INSERT OR IGNORE INTO aliases (entity, entity_id, raw_text, normalized, source, probability, first_seen_at) VALUES ('kid',?,?,?,'form',?,?)`).bind(kidId, `${f.kid_first} ${f.kid_last}`, normalize(`${f.kid_first} ${f.kid_last}`), existingKid ? kidP : 1, now).run();
  const status: SignupResult['status'] = existingFam || existingKid ? 'linked' : famP >= 0.5 ? 'review' : 'new';
  const prob = existingFam ? famP : existingKid ? kidP : famP >= 0.5 ? famP : null;
  const r = await env.DB.prepare(`INSERT INTO signups (source, raw_json, received_at, family_id, kid_id, resolve_probability, resolved_by, status) VALUES (?,?,?,?,?,?,?,?)`)
    .bind(source, JSON.stringify(f), now, familyId, kidId, prob, 'decisions', status).run();
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  const explanation = existingKid ? `${kidName} is already enrolled, so nothing was duplicated. Linked to the ${familyName} family (${pct(kidP)} sure).`
    : existingFam ? `${b.g} is already the ${familyName} family (${pct(famP)} sure). ${f.kid_first} was added to that family.`
    : status === 'review' ? `This might be the ${fam!.c.x.household_name} family (${pct(famP)} sure), so it is waiting for a quick review.`
    : `No existing family matched. Created the ${familyName} family.`;
  await env.DB.prepare(`INSERT INTO activity (kind, text, bold, link, at) VALUES (?, ?, ?, ?, ?)`).bind(existingFam || existingKid ? 'merge' : 'signup', `Sign-up from ${b.g}: ${explanation}`, b.g, `/people/families/${familyId}`, now).run();
  return { signup_id: Number(r.meta.last_row_id), status, probability: prob, family: { id: familyId, name: familyName, existing: existingFam }, kid: { id: kidId, name: kidName, existing: existingKid }, explanation, ms: Date.now() - t0 };
}

function validate(f: Partial<SignupForm>): SignupForm {
  const req = ['guardian_first', 'guardian_last', 'phone', 'kid_first', 'kid_last'] as const;
  for (const k of req) if (!String(f[k] ?? '').trim()) throw new HttpError(400, 'missing', `Please fill in ${k.replace('_', ' ')}.`);
  const lang = (['en', 'es', 'ht'].includes(String(f.language)) ? f.language : 'en') as Lang;
  return { guardian_first: f.guardian_first!.trim(), guardian_last: f.guardian_last!.trim(), phone: f.phone!.trim(), email: f.email?.trim(), language: lang, kid_first: f.kid_first!.trim(), kid_last: f.kid_last!.trim(), grade: f.grade?.trim() || '', school: f.school?.trim() || '', program: (['mentoring', 'workshop'].includes(String(f.program)) ? f.program : 'mentoring') as SignupForm['program'], neighborhood: f.neighborhood?.trim() };
}

export async function submit(env: Env, body: Partial<SignupForm>): Promise<SignupResult> {
  const t0 = Date.now();
  const f = validate(body);
  const [res] = await resolveMany(env, [f]);
  const out = await save(env, 'webform', res);
  return { ...out, ms: Date.now() - t0 };
}

export async function importCsv(env: Env, text: string): Promise<ImportResult> {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) throw new HttpError(400, 'empty', 'That file has no rows.');
  const split = (l: string) => { const out: string[] = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((s) => s.trim()); };
  const head = split(lines[0]).map((h) => normalize(h).replace(/ /g, '_'));
  const col = (row: string[], ...names: string[]) => { for (const n of names) { const i = head.findIndex((h) => h === n || h.includes(n)); if (i >= 0 && row[i]) return row[i]; } return ''; };
  const forms: SignupForm[] = lines.slice(1, 201).map((l) => {
    const r = split(l);
    const guardian = col(r, 'guardian', 'parent');
    const kid = col(r, 'kid', 'child', 'student', 'participant');
    const lang = normalize(col(r, 'language', 'lang'));
    return {
      guardian_first: col(r, 'guardian_first', 'parent_first') || guardian.split(' ')[0] || '', guardian_last: col(r, 'guardian_last', 'parent_last') || guardian.split(' ').slice(1).join(' '),
      phone: col(r, 'phone', 'cell', 'mobile'), email: col(r, 'email'), language: (lang.startsWith('sp') || lang === 'es' ? 'es' : lang.startsWith('ha') || lang.startsWith('kr') || lang === 'ht' ? 'ht' : 'en') as Lang,
      kid_first: col(r, 'kid_first', 'child_first', 'student_first') || kid.split(' ')[0] || '', kid_last: col(r, 'kid_last', 'child_last', 'student_last') || kid.split(' ').slice(1).join(' '),
      grade: col(r, 'grade'), school: col(r, 'school'), program: (normalize(col(r, 'program')).startsWith('work') ? 'workshop' : 'mentoring') as SignupForm['program'], neighborhood: col(r, 'neighborhood', 'area'),
    };
  }).filter((f) => f.kid_first && (f.guardian_first || f.phone));
  if (!forms.length) throw new HttpError(400, 'columns', 'Could not find guardian and kid columns. Use headers like Guardian, Phone, Kid, Grade, School, Language.');
  const resolved = await resolveMany(env, forms);
  const results: ImportResult['results'] = [];
  for (let i = 0; i < resolved.length; i++) {
    const s = await save(env, 'spreadsheet import', resolved[i]);
    results.push({ row: i + 2, kid: s.kid.name, guardian: `${forms[i].guardian_first} ${forms[i].guardian_last}`.trim(), status: s.status, probability: s.probability, matched_to: s.family.existing ? `${s.family.name} family` : null });
  }
  return { rows: results.length, linked: results.filter((r) => r.status === 'linked').length, created: results.filter((r) => r.status === 'new').length, review: results.filter((r) => r.status === 'review').length, results };
}
