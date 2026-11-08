// Builds the Q1 FY2027 dataset for Tidepath Family Alliance (fictional) deterministically.
// Output: seed/seed.json (structured, used by the sheet renderer) and worker/seed/seed-sql.ts (used by /api/demo/reset).
// Run: node scripts/build-seed.mjs
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- deterministic rng ---------- */
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20260923);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;

/* ---------- dates ---------- */
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dow = (s) => new Date(s + 'T12:00:00Z').getUTCDay(); // 0 Sun
function weekly(start, end, step = 7, skip = []) { const out = []; for (let d = start; d <= end; d = addDays(d, step)) if (!skip.includes(d)) out.push(d); return out; }

const Q_START = '2026-07-01', Q_END = '2026-09-30', TODAY = '2026-09-23';

/* ---------- places ---------- */
const SITES = {
  CG: { name: 'Citrus Grove MS', area: 'Little Havana' },
  WLR: { name: 'West Little River CC', area: 'West Little River' },
  OFF: { name: 'Tidepath office', area: 'Little Havana' },
};

/* ---------- mentors (18) ---------- */
const MENTORS = [
  ['luis', 'Luis Oyola', 'caveat'], ['ana', 'Ana Castellanos', 'kalam'], ['sofia', 'Sofía Pérez', 'patrick'],
  ['danielb', 'Daniel Brooks', 'gochi'], ['marcus', 'Marcus Hill', 'indie'], ['jeanmarc', 'Jean-Marc Laguerre', 'architects'],
  ['gabriela', 'Gabriela Torres', 'kalam'], ['patrick', 'Patrick Célestin', 'caveat'], ['wislande', 'Wislande Paul', 'patrick'],
  ['rosa', 'Rosa Medina', 'indie'], ['hannah', 'Hannah Kim', 'gochi'], ['carlos', 'Carlos Ibarra', 'architects'],
  ['tom', 'Tom Reyes', 'caveat'], ['ashanti', 'Ashanti Green', 'kalam'], ['diego', 'Diego Salazar', 'patrick'],
  ['lucia', 'Lucía Navarro', 'indie'], ['ruth', 'Ruth Exantus', 'gochi'], ['brian', 'Brian Cole', 'architects'],
];
let phoneN = 100;
const nextPhone = () => `(305) 555-0${String(phoneN++).padStart(3, '0')}`;
const mentors = MENTORS.map(([key, full_name, hand], i) => ({
  id: i + 1, key, full_name, hand, phone: nextPhone(),
  email: full_name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(' ', '.') + '@volunteer.tidepath.org',
}));
const M = Object.fromEntries(mentors.map((m) => [m.key, m]));

/* ---------- families & kids ---------- */
// kid: [key, first, last, grade, school, program, site, mentorKey|null, extra]
const families = [];
const kids = [];
let famId = 0, kidId = 0;
const LH_STREETS = ['SW 4th St', 'SW 6th St', 'SW 8th St', 'SW 12th Ave', 'SW 14th Ave', 'SW 17th Ave', 'NW 1st St', 'SW 3rd St'];
const WLR_STREETS = ['NW 87th St', 'NW 22nd Ave', 'NW 95th St', 'NW 27th Ave', 'NW 82nd St', 'NW 103rd St'];
function addFamily({ key, household, guardian, rel = 'Mom', lang, area, from = 'webform', email = null }) {
  const id = ++famId;
  const lh = area === 'Little Havana';
  const addr = lh ? `${1000 + Math.floor(rnd() * 1800)} ${pick(LH_STREETS)}, Miami, FL 33135` : `${2000 + Math.floor(rnd() * 900)} ${pick(WLR_STREETS)}, Miami, FL 33147`;
  const f = { id, key, household_name: household, primary_contact_name: guardian, relationship: rel, phone: nextPhone(), email, language: lang, address: addr, neighborhood: area, created_from: from };
  families.push(f);
  return f;
}
function addKid(fam, { key, first, last, grade, school, program, site, mentor = null, enrolled = '2026-06-20', status = 'active', nick = null, never = false }) {
  const id = ++kidId;
  const k = { id, key, family_id: fam.id, first_name: first, last_name: last, preferred_name: nick, grade, school, program, site, mentor, enrolled_at: enrolled, status, never, dob: null };
  const age = { '4th': 9, '5th': 10, '6th': 11, '7th': 12, '8th': 13, '9th': 14, '10th': 15, '3rd': 8 }[grade] || 12;
  k.dob = `${2026 - age - 1}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 27)).padStart(2, '0')}`;
  kids.push(k);
  return k;
}
const K = {};
const kid = (fam, o) => (K[o.key] = addKid(fam, o));

// --- Citrus Grove Wednesday mentoring (13 enrolled) ---
const fRamirez = addFamily({ key: 'ramirez', household: 'Ramírez', guardian: 'Yadira Ramírez', lang: 'es', area: 'Little Havana' });
kid(fRamirez, { key: 'dariel', first: 'Dariel', last: 'Ramírez', grade: '7th', school: 'Citrus Grove MS', program: 'mentoring', site: 'CG', mentor: 'luis', enrolled: '2026-07-14' });
kid(fRamirez, { key: 'mia', first: 'Mía', last: 'Ramírez', grade: '4th', school: 'Citrus Grove Elementary', program: 'workshop', site: 'CG', enrolled: '2026-07-14' });
const fDelgado = addFamily({ key: 'delgado', household: 'Delgado', guardian: 'Rafael Delgado', rel: 'Dad', lang: 'es', area: 'Little Havana' });
kid(fDelgado, { key: 'camila', first: 'Camila', last: 'Delgado', grade: '6th', school: 'Citrus Grove MS', program: 'mentoring', site: 'CG', mentor: 'sofia', enrolled: '2026-06-12' });
const fCarter = addFamily({ key: 'carter', household: 'Carter', guardian: 'Tanya Carter', lang: 'en', area: 'Little Havana', email: 'tanya.carter.mia@gmail.com' });
kid(fCarter, { key: 'joshua', first: 'Joshua', last: 'Carter', grade: '8th', school: 'Citrus Grove MS', program: 'mentoring', site: 'CG', mentor: 'luis', nick: 'Josh', enrolled: '2026-03-02' });
kid(fCarter, { key: 'nia', first: 'Nia', last: 'Carter', grade: '6th', school: 'Citrus Grove MS', program: 'mentoring', site: 'CG', mentor: 'sofia', enrolled: '2026-07-20' });
const fFernandez = addFamily({ key: 'fernandez', household: 'Fernández', guardian: 'Lourdes Fernández', lang: 'es', area: 'Little Havana' });
kid(fFernandez, { key: 'sofiaf', first: 'Sofía', last: 'Fernández', grade: '7th', school: 'Citrus Grove MS', program: 'mentoring', site: 'CG', mentor: 'sofia', enrolled: '2026-02-09' });
const fNguyen = addFamily({ key: 'nguyen', household: 'Nguyen', guardian: 'Linh Nguyen', lang: 'en', area: 'Little Havana' });
kid(fNguyen, { key: 'kevin', first: 'Kevin', last: 'Nguyen', grade: '6th', school: 'Citrus Grove MS', program: 'mentoring', site: 'CG', mentor: 'danielb', enrolled: '2026-07-06' });
const fHernandez = addFamily({ key: 'hernandez', household: 'Hernández', guardian: 'Marisela Hernández', lang: 'es', area: 'Little Havana' });
kid(fHernandez, { key: 'mateo', first: 'Mateo', last: 'Hernández', grade: '8th', school: 'Citrus Grove MS', program: 'mentoring', site: 'CG', mentor: 'luis', enrolled: '2025-09-15' });
const fPierreLouis = addFamily({ key: 'pierrelouis', household: 'Pierre-Louis', guardian: 'Guerline Pierre-Louis', lang: 'ht', area: 'Little Havana' });
kid(fPierreLouis, { key: 'ashley', first: 'Ashley', last: 'Pierre-Louis', grade: '7th', school: 'Citrus Grove MS', program: 'mentoring', site: 'CG', mentor: 'ana', enrolled: '2026-01-12' });
const fAugustin = addFamily({ key: 'augustin', household: 'Augustin', guardian: 'Jean-Robert Augustin', rel: 'Dad', lang: 'ht', area: 'Little Havana' });
kid(fAugustin, { key: 'jaden', first: 'Jaden', last: 'Augustin', grade: '6th', school: 'Citrus Grove MS', program: 'mentoring', site: 'CG', mentor: 'danielb', enrolled: '2026-07-08' });
const fRamos = addFamily({ key: 'ramos', household: 'Ramos', guardian: 'Maritza Ramos', lang: 'es', area: 'Little Havana' });
kid(fRamos, { key: 'valeria', first: 'Valeria', last: 'Ramos', grade: '7th', school: 'Citrus Grove MS', program: 'mentoring', site: 'CG', mentor: 'sofia', enrolled: '2025-10-06' });
const fDesir = addFamily({ key: 'desir', household: 'Désir', guardian: 'Nadège Désir', lang: 'ht', area: 'Little Havana' });
kid(fDesir, { key: 'danield', first: 'Daniel', last: 'Désir', grade: '8th', school: 'Citrus Grove MS', program: 'mentoring', site: 'CG', mentor: 'danielb', enrolled: '2026-04-20' });
const fCastillo = addFamily({ key: 'castillo', household: 'Castillo', guardian: 'Yamilé Castillo', lang: 'es', area: 'Little Havana' });
kid(fCastillo, { key: 'brianna', first: 'Brianna', last: 'Castillo', grade: '6th', school: 'Citrus Grove MS', program: 'mentoring', site: 'CG', mentor: 'ana', enrolled: '2026-07-08' });
const fFerrer = addFamily({ key: 'ferrer', household: 'Ferrer', guardian: 'Odalys Ferrer', lang: 'es', area: 'Little Havana' });
kid(fFerrer, { key: 'andres', first: 'Andrés', last: 'Ferrer', grade: '7th', school: 'Citrus Grove MS', program: 'mentoring', site: 'CG', mentor: 'ana', enrolled: '2025-11-03' });

// --- West Little River Thursday mentoring (14) ---
const fJB = addFamily({ key: 'jeanbaptiste', household: 'Jean-Baptiste', guardian: 'Marie-Claire Jean-Baptiste', lang: 'ht', area: 'West Little River' });
kid(fJB, { key: 'widlyne', first: 'Widlyne', last: 'Jean-Baptiste', grade: '7th', school: 'Brownsville MS', program: 'mentoring', site: 'WLR', mentor: 'ana', enrolled: '2026-07-08' });
kid(fJB, { key: 'kervens', first: 'Kervens', last: 'Jean-Baptiste', grade: '6th', school: 'Brownsville MS', program: 'mentoring', site: 'WLR', mentor: 'jeanmarc', enrolled: '2026-07-08', status: 'changed_school' });
const fWilliams = addFamily({ key: 'williams', household: 'Williams', guardian: 'Keisha Williams', lang: 'en', area: 'West Little River', email: 'keishaw305@yahoo.com' });
kid(fWilliams, { key: 'tyrese', first: 'Tyrese', last: 'Williams', grade: '9th', school: 'Miami Northwestern Sr High', program: 'mentoring', site: 'WLR', mentor: 'marcus', enrolled: '2025-08-25' });
const WLR_KIDS = [
  ['jayden', 'Jayden', 'Louis', '7th', 'Madison MS', 'jeanmarc', 'Louis', 'Fabienne Louis', 'ht'],
  ['christina', 'Christina', 'Joseph', '8th', 'Madison MS', 'gabriela', 'Joseph', 'Rose-Marie Joseph', 'ht'],
  ['malik', 'Malik', 'Johnson', '6th', 'Brownsville MS', 'marcus', 'Johnson', 'Shantel Johnson', 'en'],
  ['alexa', 'Alexa', 'Rodríguez', '7th', 'Madison MS', 'gabriela', 'Rodríguez', 'Mayelin Rodríguez', 'es'],
  ['samuel', 'Samuel', 'Étienne', '8th', 'Brownsville MS', 'jeanmarc', 'Étienne', 'Islande Étienne', 'ht'],
  ['danielac', 'Daniela', 'Cruz', '6th', 'Madison MS', 'gabriela', 'Cruz', 'Iliana Cruz', 'es'],
  ['jordan', 'Jordan', 'Bennett', '7th', 'Brownsville MS', 'patrick', 'Bennett', 'Monique Bennett', 'en'],
  ['fabiola', 'Fabiola', 'Saint-Fleur', '6th', 'Madison MS', 'wislande', 'Saint-Fleur', 'Marjorie Saint-Fleur', 'ht'],
  ['emmanuel', 'Emmanuel', 'Vilsaint', '8th', 'Brownsville MS', 'patrick', 'Vilsaint', 'Josette Vilsaint', 'ht'],
  ['destiny', 'Destiny', 'Moore', '7th', 'Madison MS', 'marcus', 'Moore', 'Andrea Moore', 'en'],
  ['isaac', 'Isaac', 'Morales', '6th', 'Brownsville MS', 'wislande', 'Morales', 'Dayana Morales', 'es'],
];
const NICK = { Joshua: 'Josh', Samuel: 'Sam', Emmanuel: 'Manny', Fabiola: 'Fabi', Christina: 'Chris', Alexa: 'Lexi', Daniela: 'Dani', Isabella: 'Isa', Gabriel: 'Gabe', Alejandro: 'Alex', Nathaniel: 'Nate', Jonathan: 'Jon', Valentina: 'Vale' };
for (const [key, first, last, grade, school, mentor, household, guardian, lang] of WLR_KIDS) {
  const f = addFamily({ key: household.toLowerCase(), household, guardian, lang, area: 'West Little River' });
  kid(f, { key, first, last, grade, school, program: 'mentoring', site: 'WLR', mentor, enrolled: pick(['2025-09-08', '2026-01-20', '2026-06-01', '2026-07-09', '2026-07-16']), nick: NICK[first] || null });
}

// --- Workshop-only kids (siblings + new families) ---
const sib = (famKey, key, first, grade, school, site) => {
  const f = families.find((x) => x.key === famKey);
  const last = kids.find((x) => x.family_id === f.id).last_name;
  return kid(f, { key, first, last, grade, school, program: 'workshop', site, enrolled: pick(['2026-06-15', '2026-07-01', '2026-07-12']), nick: NICK[first] || null });
};
sib('carter', 'jamal', 'Jamal', '4th', 'Citrus Grove Elementary', 'CG');
sib('fernandez', 'gabriel', 'Gabriel', '5th', 'Citrus Grove Elementary', 'CG');
sib('hernandez', 'valentina', 'Valentina', '5th', 'Citrus Grove Elementary', 'CG');
sib('pierrelouis', 'nathaniel', 'Nathaniel', '5th', 'Citrus Grove Elementary', 'CG');
sib('ramos', 'isabella', 'Isabella', '4th', 'Citrus Grove Elementary', 'CG');
sib('louis', 'stephanie', 'Stephanie', '5th', 'Shadowlawn Elementary', 'WLR');
sib('joseph', 'kenson', 'Kenson', '4th', 'Shadowlawn Elementary', 'WLR');
sib('rodríguez', 'alejandro', 'Alejandro', '5th', 'Shadowlawn Elementary', 'WLR');
sib('johnson', 'aaliyah', 'Aaliyah', '4th', 'Shadowlawn Elementary', 'WLR');
sib('saint-fleur', 'mikerline', 'Mikerline', '4th', 'Shadowlawn Elementary', 'WLR');
const WS_NEW = [
  ['lucas', 'Lucas', 'Benítez', '6th', 'Citrus Grove MS', 'CG', 'Benítez', 'Graciela Benítez', 'es', 'Little Havana'],
  ['zoe', 'Zoe', 'Martínez', '5th', 'Citrus Grove Elementary', 'CG', 'Martínez', 'Tatiana Martínez', 'es', 'Little Havana'],
  ['kenny', 'Kenny', 'Tran', '6th', 'Citrus Grove MS', 'CG', 'Tran', 'Mai Tran', 'en', 'Little Havana'],
  ['angelica', 'Angélica', 'Suárez', '7th', 'Citrus Grove MS', 'CG', 'Suárez', 'Beatriz Suárez', 'es', 'Little Havana'],
  ['jonathan', 'Jonathan', 'Pierre', '6th', 'Madison MS', 'WLR', 'Pierre', 'Mirlande Pierre', 'ht', 'West Little River'],
  ['kiara', 'Kiara', 'Thomas', '5th', 'Shadowlawn Elementary', 'WLR', 'Thomas', 'LaToya Thomas', 'en', 'West Little River'],
  ['diego', 'Diego', 'Lozano', '7th', 'Madison MS', 'WLR', 'Lozano', 'Norma Lozano', 'es', 'West Little River'],
  ['richardson', 'Richardson', 'Noël', '6th', 'Brownsville MS', 'WLR', 'Noël', 'Edeline Noël', 'ht', 'West Little River'],
];
for (const [key, first, last, grade, school, site, household, guardian, lang, area] of WS_NEW) {
  const f = addFamily({ key: household.toLowerCase(), household, guardian, lang, area });
  kid(f, { key, first, last, grade, school, program: 'workshop', site, enrolled: pick(['2026-06-25', '2026-07-03', '2026-07-18', '2026-08-01']), nick: NICK[first] || null });
}
// Signed up, never attended (still enrolled, report counts them as not served)
const NEVER = [
  ['emily', 'Emily', 'Vargas', '6th', 'Citrus Grove MS', 'CG', 'Vargas', 'Daisy Vargas', 'es', 'Little Havana'],
  ['wesley', 'Wesley', 'Louis', '7th', 'Madison MS', 'WLR', 'Louis', 'Fabienne Louis', 'ht', 'West Little River'],
  ['brandon', 'Brandon', 'Hughes', '8th', 'Brownsville MS', 'WLR', 'Hughes', 'Crystal Hughes', 'en', 'West Little River'],
  ['sofiar', 'Sofía', 'Martínez', '5th', 'Citrus Grove Elementary', 'CG', 'Martínez', 'Tatiana Martínez', 'es', 'Little Havana'],
];
for (const [key, first, last, grade, school, site, household, guardian, lang, area] of NEVER) {
  const existing = families.find((x) => x.key === household.toLowerCase());
  const f = existing || addFamily({ key: household.toLowerCase(), household, guardian, lang, area });
  kid(f, { key, first, last, grade, school, program: 'workshop', site, enrolled: '2026-08-10', never: true });
}
// Counseling clients (aggregate only, never shown by name). Most are siblings in families we already serve.
const COUNSEL_SIBS = ['delgado', 'nguyen', 'castillo', 'johnson', 'moore', 'benítez'];
COUNSEL_SIBS.forEach((fk, i) => {
  const f = families.find((x) => x.key === fk);
  const last = kids.find((x) => x.family_id === f.id).last_name;
  kid(f, { key: 'counsel' + i, first: pick(['Alex', 'Jordan', 'Sam', 'Riley', 'Chris', 'Taylor', 'Morgan', 'Jamie']), last, grade: pick(['6th', '7th', '8th', '9th']), school: f.neighborhood === 'Little Havana' ? 'Citrus Grove MS' : 'Madison MS', program: 'counseling', site: 'OFF', enrolled: '2026-05-01' });
});
[['Ortega', 'es'], ['Florestal', 'ht']].forEach(([last, lang], i) => {
  const f = addFamily({ key: 'counselnew' + i, household: last, guardian: `${pick(['María', 'Rose', 'Denise', 'Carmen'])} ${last}`, lang, area: i ? 'West Little River' : 'Little Havana', from: 'intake' });
  kid(f, { key: 'counseln' + i, first: pick(['Alex', 'Riley', 'Chris']), last, grade: '7th', school: i ? 'Madison MS' : 'Citrus Grove MS', program: 'counseling', site: 'OFF', enrolled: '2026-05-01' });
});
// More workshop siblings so families with 2-3 kids are common
sib('augustin', 'naika', 'Naïka', '4th', 'Citrus Grove Elementary', 'CG');
sib('étienne', 'samantha', 'Samantha', '5th', 'Shadowlawn Elementary', 'WLR');
sib('cruz', 'mateoc', 'Matías', '4th', 'Shadowlawn Elementary', 'WLR');

/* ---------- mentor matches ---------- */
const matches = [];
for (const k of kids) {
  if (!k.mentor) continue;
  const started = k.enrolled_at < '2026-07-01' ? addDays(k.enrolled_at, 7) : addDays(k.enrolled_at, 1);
  matches.push({ id: matches.length + 1, kid_id: k.id, mentor_id: M[k.mentor].id, started_at: started, ended_at: null });
}
// one match ended mid-quarter (mentor changed): Jordan Bennett had Brian Cole until Aug 14
matches.push({ id: matches.length + 1, kid_id: K.jordan.id, mentor_id: M.brian.id, started_at: '2026-02-02', ended_at: '2026-08-14' });
matches.find((m) => m.kid_id === K.jordan.id && m.mentor_id === M.patrick.id).started_at = '2026-08-15';

/* ---------- spelling variants (how a mentor writes a kid's name) ---------- */
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const ABBR = { 'Ramírez': 'Rmz', 'Hernández': 'Hdz', 'Fernández': 'Fdz', 'Rodríguez': 'Rdz', 'Martínez': 'Mtz' };
function variants(k) {
  const f = k.first_name, l = k.last_name, nick = k.preferred_name;
  const v = [`${f} ${l}`, `${strip(f)} ${strip(l)}`, `${strip(f)} ${strip(l)[0]}.`, `${strip(f)[0]}. ${strip(l)}`];
  if (ABBR[l]) v.push(`${strip(f)} ${ABBR[l]}`);
  if (nick) v.push(`${nick} ${strip(l)}`);
  if (l.includes('-')) v.push(`${strip(f)} ${strip(l).replace('-', ' ')}`, `${strip(f)} ${strip(l).replace('-', '')}`);
  return v;
}
const STYLE = { // mentor tendencies → preferred variant indexes
  luis: [1, 1, 3, 2], sofia: [0, 0, 0, 1], ana: [1, 2, 2, 0], danielb: [1, 1, 5, 3], marcus: [1, 1, 2, 0],
  jeanmarc: [0, 1, 1, 3], gabriela: [0, 1, 1, 2], patrick: [1, 3, 1, 1], wislande: [0, 1, 6, 1],
};
function spell(k, writerKey, forbid = []) {
  const v = variants(k);
  const prefs = STYLE[writerKey] || [1, 1, 0, 2];
  for (let tries = 0; tries < 8; tries++) {
    const idx = chance(0.18) ? Math.floor(rnd() * v.length) : pick(prefs);
    const s = v[Math.min(idx, v.length - 1)];
    if (!forbid.includes(s)) return s;
  }
  return v[1];
}

/* ---------- schedule ---------- */
const CG_MENT = weekly('2026-07-08', '2026-09-16');                     // Wednesdays
const WLR_MENT = weekly('2026-07-09', '2026-09-17');                    // Thursdays
const COUNSEL_DAYS = weekly('2026-07-06', '2026-09-21', 7, ['2026-09-07']); // Mondays, Labor Day off
const WORKSHOPS = [['2026-07-07', 'CG'], ['2026-07-21', 'WLR'], ['2026-08-04', 'CG'], ['2026-08-18', 'WLR'], ['2026-09-01', 'CG'], ['2026-09-15', 'WLR']];

const sessions = [];
const attendance = [];
const facilitatorOf = { CG: 'luis', WLR: 'marcus' };
// Spellings Luis uses on the live Sep 23 sheet: history must not already contain them, so saving it teaches new aliases.
const DEMO_FORBID = { dariel: ['Dariel Rmz'], danield: ['D. Desir'], andres: ['Andres F.'], mateo: ['Mateo Hernandez'], joshua: ['Josh Carter'], sofiaf: ['Sofia Fernandez'] };
let sessId = 0;

// planted absence patterns (dates the kid was ABSENT); anything not listed is present with noise
const ABSENT = {
  dariel: ['2026-09-09', '2026-09-16'],
  camila: ['2026-07-29', '2026-09-16'],
  widlyne: ['2026-07-23', '2026-09-10', '2026-09-17'],
  tyrese: ['2026-08-13', '2026-08-27', '2026-09-03', '2026-09-17'],
  valeria: ['2026-08-19', '2026-09-16'],
  jordan: ['2026-09-17'],
  isaac: ['2026-07-30', '2026-09-17'],
  kervens: [],
  danield: ['2026-08-05'],
};
// past episodes: two in a row, family reached, kid came back (these become closed follow-ups)
const EPISODES = [
  ['mateo', '2026-07-15', '2026-07-22', 2, 'call', 'Spoke with Mrs. Hernández. Mateo had summer school make-up classes those two Wednesdays. Back next week.'],
  ['ashley', '2026-07-22', '2026-07-29', 1, 'call', 'Called mom. Family was in Orlando visiting relatives. Ashley back Aug 5.'],
  ['kevin', '2026-08-12', '2026-08-19', 3, 'text', 'Mom replied by WhatsApp: Kevin had the flu. He is better now.'],
  ['jaden', '2026-07-29', '2026-08-05', 2, 'call', 'Dad says Jaden was helping at the family shop. Agreed to keep Wednesdays free.'],
  ['brianna', '2026-08-26', '2026-09-02', 1, 'call', 'Mom changed jobs and could not do pickup. Connected her with the carpool list.'],
  ['christina', '2026-07-16', '2026-07-23', 2, 'call', 'Talked to Rose-Marie. Christina was at a church youth camp.'],
  ['malik', '2026-08-06', '2026-08-13', 4, 'call', 'Malik was suspended for two days at school. Mom asked for extra mentoring time. Marcus following up.'],
  ['samuel', '2026-08-20', '2026-08-27', 1, 'text', 'Mom replied: Samuel has football practice on Thursdays now. Moved his check-in to 5:30.'],
  ['danielac', '2026-07-30', '2026-08-06', 3, 'call', 'Family moved apartments within West Little River. New address on file.'],
  ['emmanuel', '2026-08-13', '2026-08-20', 2, 'call', 'Emmanuel was sick. Mom said he wants to keep coming.'],
  ['destiny', '2026-07-09', '2026-07-16', 5, null, null],
  ['fabiola', '2026-08-27', '2026-09-03', 2, 'call', 'Mom works nights now; grandmother will bring Fabiola.'],
  ['alexa', '2026-07-23', '2026-07-30', 6, null, null],
  ['andres', '2026-08-05', '2026-08-12', 2, 'call', 'Andrés had a dentist appointment and then a school event. All good.'],
  ['joshua', '2026-07-08', '2026-07-15', 1, 'text', 'Tanya replied: Josh was at his dad\'s for two weeks.'],
  ['nia', '2026-08-19', '2026-08-26', 2, 'call', 'Nia was out with an ear infection.'],
];
for (const [k, a, b] of EPISODES) ABSENT[k] = [...(ABSENT[k] || []), a, b];

function attendsDate(k, date, base) {
  if ((ABSENT[k.key] || []).includes(date)) return 'absent';
  if (['dariel', 'camila', 'widlyne', 'tyrese', 'valeria', 'jordan', 'isaac', 'kervens', 'danield', 'joshua', 'nia', 'mateo', 'ashley'].includes(k.key)) return 'present';
  // others: present with base probability, but never two absences in a row and never absent in September
  if (date >= '2026-09-01') return 'present';
  return chance(base) ? 'present' : 'absent';
}

function rowsFor(list, date, writer, site) {
  // never-two-in-a-row guard for random absences
  return list.map((k, i) => {
    let mark = attendsDate(k, date, 0.93);
    if (mark === 'absent' && !(ABSENT[k.key] || []).includes(date)) {
      const prev = attendance.filter((a) => a.kid_id === k.id).slice(-1)[0];
      if (prev && prev.mark === 'absent') mark = 'present';
    }
    return { kid: k, mark, raw_text: spell(k, writer, DEMO_FORBID[k.key] || []), row_index: i + 1 };
  });
}

function addSession(program, siteKey, date, time, facilitatorKey, rows, extra = {}) {
  const id = ++sessId;
  const s = { id, program, site: SITES[siteKey].name, siteKey, held_at: date, start_time: time, facilitator_mentor_id: facilitatorKey ? M[facilitatorKey].id : null, facilitator_key: facilitatorKey, source: program === 'counseling' ? 'manual' : 'seed', header_confidence: program === 'counseling' ? null : 0.9 + rnd() * 0.09, ...extra };
  sessions.push(s);
  for (const r of rows) {
    attendance.push({ session_id: id, kid_id: r.kid ? r.kid.id : null, raw_text: program === 'counseling' ? null : r.raw_text, mark: r.mark, row_index: program === 'counseling' ? null : r.row_index, match_probability: program === 'counseling' ? null : r.prob ?? Number((0.9 + rnd() * 0.095).toFixed(2)), match_method: r.method || 'auto', confirmed_at: `${date}T${time === '16:00' ? '17:12' : '18:05'}:00`, kid_key: r.kid?.key });
  }
  return s;
}

const cgKids = kids.filter((k) => k.site === 'CG' && k.program === 'mentoring');
const wlrKids = kids.filter((k) => k.site === 'WLR' && k.program === 'mentoring');

// merge timeline in date order so "never two in a row" sees prior sessions
const allDates = [
  ...CG_MENT.map((d) => ['CGM', d]), ...WLR_MENT.map((d) => ['WLRM', d]),
  ...WORKSHOPS.map(([d, s]) => ['WS' + s, d]), ...COUNSEL_DAYS.map((d) => ['C', d]),
].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));

for (const [kind, date] of allDates) {
  if (kind === 'CGM') {
    const lead = date === '2026-08-12' ? 'sofia' : 'luis';            // Luis out one week, Sofía led
    const rows = rowsFor(cgKids.filter((k) => k.enrolled_at <= date || k.enrolled_at <= addDays(date, 6)), date, lead, 'CG');
    addSession('mentoring', 'CG', date, '16:00', lead, rows, { co_lead: date === '2026-09-16' ? 'ana' : null });
  } else if (kind === 'WLRM') {
    const rows = rowsFor(wlrKids.filter((k) => k.enrolled_at <= addDays(date, 6)), date, 'marcus', 'WLR');
    addSession('mentoring', 'WLR', date, '16:30', 'marcus', rows);
  } else if (kind.startsWith('WS')) {
    const sk = kind.slice(2);
    const pool = kids.filter((k) => !k.never && k.program !== 'counseling' && k.site === sk && (k.program === 'workshop' || chance(0.45)));
    const rows = rowsFor(pool, date, sk === 'CG' ? 'rosa' : 'wislande', sk).filter((r) => r.mark === 'present' || chance(0.3));
    rows.forEach((r, i) => (r.row_index = i + 1));
    const s = addSession('workshop', sk, date, '18:00', sk === 'CG' ? 'rosa' : 'wislande', rows, { title: pick(['Staying safe online', 'Feelings and stress', 'Bullying: what to do', 'Healthy friendships', 'Back to school ready', 'Talking with your parents']) });
    if (date === '2026-08-18') s.parent_helper = 'Marie Jean Baptiste';
  } else if (kind === 'C') {
    const pool = kids.filter((k) => k.program === 'counseling');
    addSession('counseling', 'OFF', date, '15:00', null, pool.map((k) => ({ kid: k, mark: chance(0.86) ? 'present' : 'absent', raw_text: null, row_index: null, method: 'staff', prob: null })));
  }
}
// a row nobody could match on Sep 16 ("Jhon P.") — left unresolved
const sep16 = sessions.find((s) => s.program === 'mentoring' && s.siteKey === 'CG' && s.held_at === '2026-09-16');
attendance.push({ session_id: sep16.id, kid_id: null, raw_text: 'Jhon P.', mark: 'present', row_index: attendance.filter((a) => a.session_id === sep16.id).length + 1, match_probability: 0.22, match_method: 'skipped', confirmed_at: '2026-09-16T17:12:00', kid_key: null });
// one unclear mark in history
const anUnclear = attendance.find((a) => a.session_id === sessions.find((s) => s.held_at === '2026-08-26' && s.siteKey === 'CG').id && a.kid_key === 'valeria');
if (anUnclear) anUnclear.mark = 'unclear';

/* ---------- hours ---------- */
const hours = [];
const hourKey = (mid, date, siteKey, program) => `${mid}|${date}|${siteKey}|${program}`;
function addHours(mentorKey, s, h, source, reported_at, raw = null, note = null) {
  const m = M[mentorKey];
  hours.push({ mentor_id: m.id, session_id: s ? s.id : null, held_on: s ? s.held_at : reported_at.slice(0, 10), site: s ? s.site : null, program: s ? s.program : 'event', hours: h, reported_at, source, raw_text: raw, dedupe_key: s ? hourKey(m.id, s.held_at, s.siteKey, s.program) : `${m.id}|${reported_at.slice(0, 10)}|event|${hours.length}`, note });
}
const mentorSites = { CG: ['luis', 'sofia', 'ana', 'danielb'], WLR: ['marcus', 'jeanmarc', 'gabriela', 'patrick', 'wislande'] };
for (const s of sessions) {
  if (s.program === 'mentoring') {
    for (const mk of mentorSites[s.siteKey]) {
      if (mk === 'ana' && s.siteKey === 'CG' && s.held_at !== '2026-09-16') continue; // Ana only co-led CG once
      if (mk !== s.facilitator_key && chance(0.12)) continue; // sometimes a mentor misses a week
      const src = mk === s.facilitator_key ? 'sheet' : pick(['form', 'form', 'text']);
      const reported = src === 'sheet' ? `${s.held_at}T17:15:00` : `${src === 'text' ? s.held_at : addDays(s.held_at, 1)}T${src === 'text' ? '19:40' : '09:10'}:00`;
      const raw = src === 'text' ? `${M[mk].full_name.split(' ')[0]}: ${s.siteKey === 'CG' ? 'Citrus Grove' : 'WLR'} today, 2 hrs` : null;
      if (s.held_at === '2026-09-16' && s.siteKey === 'CG' && mk === 'luis') continue; // handled below (T4)
      addHours(mk, s, 2.0, src, reported, raw, mk === 'ana' && s.held_at === '2026-09-16' ? 'Co-led with Luis Oyola' : null);
    }
  } else if (s.program === 'workshop') {
    addHours(s.facilitator_key, s, 2.5, 'sheet', `${s.held_at}T20:10:00`);
    for (const mk of pick([['hannah', 'carlos'], ['tom', 'lucia'], ['ashanti', 'ruth'], ['diego', 'hannah']])) addHours(mk, s, 2.5, 'form', `${addDays(s.held_at, 1)}T10:00:00`);
  }
}
// T4: Luis double-reports Sep 16 (text the same night, form next morning)
addHours('luis', sep16, 2.0, 'text', '2026-09-16T19:52:00', 'Luis: CG today 2 hrs, Ana co-led');
addHours('luis', sep16, 2.0, 'form', '2026-09-17T08:31:00', null);
// Community events & supply runs (volunteer drivers, event helpers)
const EVENTS = [
  ['2026-07-11', 'Back-to-school backpack packing', ['rosa', 'hannah', 'carlos', 'tom', 'lucia', 'ruth', 'brian', 'diego'], 3],
  ['2026-07-25', 'Family movie night, Little Havana', ['ashanti', 'lucia', 'tom', 'rosa', 'carlos'], 3.5],
  ['2026-08-08', 'School supply drive', ['brian', 'diego', 'ruth', 'hannah', 'ashanti', 'tom', 'carlos', 'lucia', 'rosa'], 4],
  ['2026-08-22', 'Community health fair, West Little River', ['wislande', 'ruth', 'patrick', 'jeanmarc', 'gabriela', 'brian'], 4],
  ['2026-09-12', 'Hispanic Heritage family day', ['rosa', 'lucia', 'diego', 'carlos', 'sofia', 'luis', 'tom'], 3],
];
for (const [date, title, people, h] of EVENTS) for (const p of people) addHours(p, null, h, pick(['form', 'text']), `${date}T18:00:00`, `${title}`);
// supply drivers, weekly
for (const d of weekly('2026-07-03', '2026-09-18')) {
  addHours('brian', null, 1.5, 'text', `${d}T13:00:00`, `Food pantry pickup run ${d.slice(5)}`);
  if (chance(0.6)) addHours('ruth', null, 1.5, 'text', `${d}T14:00:00`, `Supply drop-off WLR ${d.slice(5)}`);
}
// T1: Ana's text mentions "M.C. Jeanbaptiste"
addHours('ana', null, 1.5, 'text', '2026-09-03T20:15:00', 'drove M.C. Jeanbaptiste + kids to WLR, 1.5h');
// office volunteers fill to a realistic count
while (hours.length < 212) addHours(pick(['hannah', 'tom', 'lucia', 'ashanti']), null, pick([1, 1.5, 2]), 'form', `${addDays('2026-07-01', Math.floor(rnd() * 80))}T11:00:00`, pick(['Front desk help', 'Data entry for intake forms', 'Call reminders for families', 'Snack prep for workshops']));
// dedupe: within the same dedupe_key keep the first, supersede later ones
const seenKey = {};
hours.forEach((h, i) => { h.id = i + 1; });
for (const h of hours) {
  if (seenKey[h.dedupe_key]) { h.superseded_by = seenKey[h.dedupe_key]; h.note = 'Reported twice, counted once'; } else seenKey[h.dedupe_key] = h.id;
}

/* ---------- sign-ups (web form) ---------- */
const signups = [];
const fam = (id) => families.find((f) => f.id === id);
function addSignup(k, { raw_first, raw_last, received, prob, status = 'linked', source = 'webform', guardianOverride = null }) {
  const f = fam(k.family_id);
  const g = guardianOverride || f.primary_contact_name;
  const [gf, ...gl] = g.split(' ');
  signups.push({ id: signups.length + 1, source, received_at: received, family_id: f.id, kid_id: k.id, resolve_probability: prob, resolved_by: prob ? 'decisions' : 'new', status,
    raw_json: { guardian_first: gf, guardian_last: gl.join(' '), phone: f.phone, email: f.email, language: f.language, kid_first: raw_first ?? k.first_name, kid_last: raw_last ?? k.last_name, grade: k.grade, school: k.school, program: k.program, neighborhood: f.neighborhood } });
}
for (const k of kids) {
  if (k.program === 'counseling') continue;
  const received = k.enrolled_at >= '2026-06-01' ? addDays(k.enrolled_at, -Math.floor(2 + rnd() * 6)) : null;
  if (!received) continue;
  addSignup(k, { received: `${received}T${String(8 + Math.floor(rnd() * 12)).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}:00`, prob: null, status: 'new' });
}
// T1 Marie-Claire's original sign-up (Jul 8) is the Widlyne sign-up; make sure its guardian text is exact
// T6: duplicate sign-up typed with a nickname, resolved to the existing kid
addSignup(K.joshua, { raw_first: 'Josh', received: '2026-07-19T21:04:00', prob: 0.94, status: 'linked' });
// Returning families signing a sibling up again, resolved
addSignup(K.dariel, { raw_first: 'Dariel', raw_last: 'Ramirez', received: '2026-08-30T10:12:00', prob: 0.98, status: 'linked' });
addSignup(K.kervens, { raw_first: 'Kervens', raw_last: 'Jean Baptiste', received: '2026-09-09T19:30:00', prob: 0.96, status: 'linked', guardianOverride: 'Marie Claire Jeanbaptiste' });
// two waiting for review ("Check these")
const fNew1 = addFamily({ key: 'paredes', household: 'Paredes', guardian: 'Iris Paredes', lang: 'es', area: 'Little Havana' });
const yanelSister = addKid(fNew1, { key: 'yarenis', first: 'Yarenis', last: 'Paredes', grade: '4th', school: 'Citrus Grove Elementary', program: 'workshop', site: 'CG', enrolled: '2026-09-20', never: true });
signups.push({ id: signups.length + 1, source: 'webform', received_at: '2026-09-20T18:44:00', family_id: fNew1.id, kid_id: yanelSister.id, resolve_probability: 0.58, resolved_by: 'decisions', status: 'review', raw_json: { guardian_first: 'Iris', guardian_last: 'Paredes', phone: fNew1.phone, language: 'es', kid_first: 'Yarenis', kid_last: 'Paredes', grade: '4th', school: 'Citrus Grove Elementary', program: 'workshop', neighborhood: 'Little Havana', note: 'Possible match: Yarelis Pardo (workshop, 2025)' } });
signups.push({ id: signups.length + 1, source: 'webform', received_at: '2026-09-21T09:15:00', family_id: fWilliams.id, kid_id: null, resolve_probability: 0.71, resolved_by: 'decisions', status: 'review', raw_json: { guardian_first: 'Keisha', guardian_last: 'Wiliams', phone: '(305) 555-0' + '199', language: 'en', kid_first: 'Tyrell', kid_last: 'Williams', grade: '6th', school: 'Brownsville MS', program: 'mentoring', neighborhood: 'West Little River' } });
// older sign-ups from families who later re-registered (paper intake typed later)
while (signups.length < 71) {
  const k = pick(kids.filter((x) => x.program !== 'counseling' && !x.never));
  addSignup(k, { received: `${addDays('2026-06-01', Math.floor(rnd() * 25))}T12:00:00`, prob: Number((0.9 + rnd() * 0.09).toFixed(2)), status: 'linked', source: pick(['webform', 'paper intake', 'back-to-school fair']) });
}

/* ---------- aliases learned during the quarter ---------- */
const norm = (s) => strip(String(s)).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const aliases = [];
const aliasSeen = new Set();
function addAlias(entity, entity_id, raw, source, source_ref, at, prob = null) {
  const n = norm(raw);
  const key = `${entity}|${entity_id}|${n}`;
  if (aliasSeen.has(key)) return;
  aliasSeen.add(key);
  aliases.push({ entity, entity_id, raw_text: raw, normalized: n, source, source_ref, probability: prob, first_seen_at: at });
}
for (const k of kids) addAlias('kid', k.id, `${k.first_name} ${k.last_name}`, 'record', null, k.enrolled_at + 'T00:00:00', 1);
for (const a of attendance) if (a.kid_id && a.raw_text) addAlias('kid', a.kid_id, a.raw_text, 'sheet', `session:${a.session_id}:${a.row_index}`, a.confirmed_at, a.match_probability);
for (const s of signups) if (s.kid_id) addAlias('kid', s.kid_id, `${s.raw_json.kid_first} ${s.raw_json.kid_last}`, 'form', `signup:${s.id}`, s.received_at, s.resolve_probability);
for (const f of families) addAlias('family', f.id, f.primary_contact_name, 'record', null, '2026-06-01T00:00:00', 1);
// T1: Marie-Claire in three places
addAlias('family', fJB.id, 'Marie-Claire Jean-Baptiste', 'form', `signup:${signups.find((s) => s.kid_id === K.widlyne.id).id}`, '2026-07-02T19:20:00', 1);
const ws818 = sessions.find((s) => s.held_at === '2026-08-18' && s.program === 'workshop');
addAlias('family', fJB.id, 'Marie Jean Baptiste', 'sheet', `session:${ws818.id}:helper`, '2026-08-18T20:10:00', 0.97);
addAlias('family', fJB.id, 'M.C. Jeanbaptiste', 'text', `hours:${hours.find((h) => h.raw_text && h.raw_text.includes('Jeanbaptiste')).id}`, '2026-09-03T20:15:00', 0.92);
addAlias('family', fJB.id, 'Marie Claire Jeanbaptiste', 'form', `signup:${signups.find((s) => s.kid_id === K.kervens.id && s.status === 'linked' && s.resolve_probability).id}`, '2026-09-09T19:30:00', 0.96);
for (const m of mentors) addAlias('mentor', m.id, m.full_name, 'record', null, '2026-01-01T00:00:00', 1);

/* ---------- school change (T3) ---------- */
const statusHistory = [{ kid_id: K.kervens.id, from_status: 'active', to_status: 'changed_school', from_school: 'Citrus Grove MS', to_school: 'Brownsville MS', changed_at: '2026-09-08', note: 'Family moved to West Little River in August. Still comes to Thursday mentoring at WLR CC with Jean-Marc.' }];

/* ---------- follow-ups: history (closed), current open, watch ---------- */
const followups = [];
const contacts = [];
const messages = [];
const messageEvents = [];
const T = (d, hm) => `${d}T${hm}:00`;
const kidName = (k) => `${k.first_name} ${k.last_name}`;
const firstGuardian = (k) => fam(k.family_id).primary_contact_name;
const sessionsFor = (k) => sessions.filter((s) => attendance.some((a) => a.session_id === s.id && a.kid_id === k.id)).map((s) => s.held_at);
const mentorFor = (k) => { const m = matches.find((x) => x.kid_id === k.id && !x.ended_at); return m ? mentors.find((y) => y.id === m.mentor_id) : null; };
const md = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const HIST_MSG = {
  es: (g, k, d1, d2, m) => `Hola ${g.split(' ')[0]}, le escribe Marisol de Tidepath Family Alliance. ${k} no vino a las sesiones del ${d1} y ${d2}. ${m} pregunta por ${k}. ¿Todo bien? Me puede responder aquí o llamar al (305) 555-0142.`,
  en: (g, k, d1, d2, m) => `Hi ${g.split(' ')[0]}, this is Marisol from Tidepath Family Alliance. ${k} missed the sessions on ${d1} and ${d2}. ${m} has been asking about ${k}. Is everything OK? You can reply here or call (305) 555-0142.`,
  ht: (g, k, d1, d2, m) => `Bonjou ${g.split(' ')[0]}, se Marisol nan Tidepath Family Alliance. ${k} pa t vini nan sesyon ${d1} ak ${d2} yo. ${m} ap mande pou ${k}. Tout bagay anfòm? Ou ka reponn isit la oswa rele (305) 555-0142.`,
};
const REPLIES = {
  es: ['Hola Marisol, sí todo bien. Estuvo enfermo. La semana que viene va. Gracias por avisar.', 'Gracias. Tuvimos un problema con el transporte, ya lo resolvimos.'],
  en: ['Hi! Thanks for checking in. He was sick, he will be there next week.', 'Sorry about that, we were out of town. Back this week.'],
  ht: ['Bonjou Marisol, mèsi. Li te malad. L ap vini semèn pwochèn.', 'Mèsi paske w ekri. Nou te gen yon pwoblèm transpò, li regle.'],
};
let msgCounter = 4000;
function addThread(fuId, f, body, sentAt, reply, replyAt) {
  const mid = messages.length + 1;
  messages.push({ id: mid, followup_id: fuId, family_id: f.id, channel: 'whatsapp', direction: 'out', to_number: f.phone, body, provider: 'whatsapp_sandbox', provider_message_id: `wamid.HBgL${(++msgCounter).toString(36).toUpperCase()}SANDBOX`, status: reply ? 'read' : 'delivered', created_at: sentAt, updated_at: sentAt });
  messageEvents.push({ message_id: mid, status: 'queued', at: sentAt }, { message_id: mid, status: 'sent', at: sentAt }, { message_id: mid, status: 'delivered', at: sentAt.replace(/:00$/, ':04') });
  if (reply) {
    messageEvents.push({ message_id: mid, status: 'read', at: replyAt });
    const rid = messages.length + 1;
    messages.push({ id: rid, followup_id: fuId, family_id: f.id, channel: 'whatsapp', direction: 'in', to_number: null, body: reply, provider: 'whatsapp_sandbox', provider_message_id: `wamid.IN${(++msgCounter).toString(36).toUpperCase()}SANDBOX`, status: 'received', created_at: replyAt, updated_at: replyAt });
    messageEvents.push({ message_id: rid, status: 'received', at: replyAt });
  }
}
for (const [kk, miss1, miss2, daysToContact, kind, note] of EPISODES) {
  const k = K[kk];
  const f = fam(k.family_id);
  const m = mentorFor(k);
  const id = followups.length + 1;
  const contactDate = addDays(miss2, Math.min(daysToContact, 3));
  const reached = !!kind;
  followups.push({ id, kid_id: k.id, family_id: f.id, severity: 'call', severity_score: 2.0 + rnd() * 0.3, severity_confidence: 0.7 + rnd() * 0.2, language: f.language,
    reason_json: { consecutive_misses: 2, missed: [miss1, miss2] }, draft_text: HIST_MSG[f.language](f.primary_contact_name, k.first_name, md(miss1), md(miss2), m ? m.full_name.split(' ')[0] : 'Su mentor'),
    facts_json: [], status: reached ? 'closed' : 'sent', first_miss_at: miss1, created_at: T(miss2, '17:20'), updated_at: T(contactDate, '12:00'), sent_at: T(addDays(miss2, 1), '09:30'), replied_at: kind === 'text' ? T(addDays(miss2, 1), '13:05') : null, closed_at: reached ? T(contactDate, '12:00') : null });
  addThread(id, f, followups[followups.length - 1].draft_text, T(addDays(miss2, 1), '09:30'), kind === 'text' ? pick(REPLIES[f.language]) : null, T(addDays(miss2, 1), '13:05'));
  if (reached) contacts.push({ family_id: f.id, kid_id: k.id, followup_id: id, kind: kind === 'text' ? 'reply' : 'call', body: note, happened_at: T(contactDate, kind === 'text' ? '13:05' : '11:40') });
}
// Kervens school change note
contacts.push({ family_id: fJB.id, kid_id: K.kervens.id, followup_id: null, kind: 'call', body: '"Kervens is switching schools to Brownsville MS, still coming Thursdays." Updated his school.', happened_at: T('2026-09-09', '15:10') });

// Open follow-ups as of Wed Sep 23 before the Citrus Grove sheet is captured
const OPEN = [
  { k: 'dariel', sev: 'call', score: 2.12, conf: 0.81, miss: ['2026-09-09', '2026-09-16'], next: 'Wed Sep 23, 4:00 pm',
    es: 'Hola Sra. Ramírez, le escribe Marisol de Tidepath Family Alliance. Dariel no vino a las sesiones de mentoría del 9 y 16 de septiembre en Citrus Grove. Luis, su mentor, pregunta por él. ¿Está todo bien? La próxima sesión es hoy miércoles 23 a las 4:00 pm. Puede responder aquí o llamar al (305) 555-0142.',
    en: 'Hi Mrs. Ramírez, this is Marisol from Tidepath Family Alliance. Dariel missed his mentoring sessions on September 9 and 16 at Citrus Grove. Luis, his mentor, is asking about him. Is everything OK? The next session is today, Wednesday the 23rd, at 4:00 pm. You can reply here or call (305) 555-0142.' },
  { k: 'widlyne', sev: 'call', score: 2.04, conf: 0.77, miss: ['2026-09-10', '2026-09-17'], next: 'Thu Sep 24, 4:30 pm',
    ht: 'Bonjou Madan Jean-Baptiste, se Marisol nan Tidepath Family Alliance. Widlyne pa t vini nan sesyon mantora 10 ak 17 septanm yo nan West Little River. Ana, mantò li, ap mande pou li. Èske tout bagay anfòm? Pwochen sesyon an se jedi 24 septanm a 4:30 pm. Ou ka reponn isit la oswa rele (305) 555-0142.',
    en: 'Hello Mrs. Jean-Baptiste, this is Marisol from Tidepath Family Alliance. Widlyne missed her mentoring sessions on September 10 and 17 at West Little River. Ana, her mentor, is asking about her. Is everything OK? The next session is Thursday, September 24 at 4:30 pm. You can reply here or call (305) 555-0142.' },
  { k: 'tyrese', sev: 'call', score: 1.93, conf: 0.72, miss: ['2026-08-27', '2026-09-03', '2026-09-17'], next: 'Thu Sep 24, 4:30 pm',
    en: 'Hi Ms. Williams, this is Marisol from Tidepath Family Alliance. Tyrese missed three of his last four Thursday mentoring sessions at West Little River (Aug 27, Sep 3 and Sep 17). Marcus, his mentor, would love to see him back. Can we talk this week? The next session is Thursday, September 24 at 4:30 pm. Call or text (305) 555-0142.' },
];
for (const o of OPEN) {
  const k = K[o.k]; const f = fam(k.family_id); const m = mentorFor(k);
  const lang = f.language;
  followups.push({ id: followups.length + 1, kid_id: k.id, family_id: f.id, severity: o.sev, severity_score: o.score, severity_confidence: o.conf, language: lang,
    reason_json: { missed: o.miss, next: o.next }, draft_text: o[lang], draft_translation: lang === 'en' ? null : o.en,
    facts_json: [
      { kind: 'sheet', label: `Missed ${o.miss.map(md).join(', ')}`, source: `${o.miss.length} sheets` },
      { kind: 'mentor', label: `Mentor ${m.full_name}`, source: `since ${md(matches.find((x) => x.kid_id === k.id && !x.ended_at).started_at)}` },
      { kind: 'form', label: { es: 'Spanish', ht: 'Haitian Creole', en: 'English' }[lang], source: 'sign-up form' },
      { kind: 'schedule', label: `Next: ${o.next}`, source: 'schedule' },
    ],
    status: 'open', first_miss_at: o.miss[0], created_at: T(o.miss[o.miss.length - 1], '18:20'), updated_at: T(o.miss[o.miss.length - 1], '18:20'), sent_at: null });
}
// Watch (one recent miss)
for (const [kk, miss] of [['camila', '2026-09-16'], ['valeria', '2026-09-16'], ['jordan', '2026-09-17'], ['isaac', '2026-09-17']]) {
  const k = K[kk]; const f = fam(k.family_id);
  followups.push({ id: followups.length + 1, kid_id: k.id, family_id: f.id, severity: 'watch', severity_score: 1.05 + rnd() * 0.2, severity_confidence: 0.7, language: f.language, reason_json: { missed: [miss] }, draft_text: null, facts_json: [], status: 'open', first_miss_at: miss, created_at: T(miss, '18:20'), updated_at: T(miss, '18:20') });
}

/* ---------- activity feed ---------- */
const activity = [
  { kind: 'read', text: 'Read 14 names from the West Little River mentoring sheet', bold: '14 names', link: null, at: '2026-09-17T18:05:00' },
  { kind: 'dedupe', text: 'Luis reported Sep 16 twice. Counted once.', bold: 'Counted once.', link: `/people/mentors/${M.luis.id}`, at: '2026-09-17T08:31:00' },
  { kind: 'merge', text: '"Marie Claire Jeanbaptiste" was already a family. Linked it.', bold: 'already a family', link: `/people/families/${fJB.id}`, at: '2026-09-09T19:30:00' },
  { kind: 'draft', text: 'Wrote 3 messages in Spanish, Kreyòl and English', bold: '3 messages', link: '/calls', at: '2026-09-17T18:20:00' },
  { kind: 'reply', text: 'Mom replied on WhatsApp about Samuel. Moved his check-in.', bold: 'replied', link: null, at: '2026-08-28T13:05:00' },
  { kind: 'signup', text: '2 new sign-ups might be kids we already know', bold: '2 new sign-ups', link: '/people?tab=signups', at: '2026-09-21T09:15:00' },
];

/* ---------- integrations ---------- */
const integrations = [
  { key: 'whatsapp', name: 'WhatsApp Business', kind: 'messaging', status: 'connected', mode: 'sandbox', detail: 'Sends follow-ups from +1 (305) 555-0142. Delivery and read receipts come back by webhook.', last_sync_at: '2026-09-17T18:21:00', last_result: '41 messages this quarter · 39 delivered · 14 replies' },
  { key: 'sms', name: 'SMS (Twilio)', kind: 'messaging', status: 'connected', mode: 'sandbox', detail: 'Fallback for families without WhatsApp.', last_sync_at: '2026-09-02T10:00:00', last_result: '6 messages this quarter' },
  { key: 'webform', name: 'Online sign-up form', kind: 'forms', status: 'connected', mode: 'live', detail: 'Every submission is matched to existing families before it is saved. Webhook: POST /api/signups', last_sync_at: '2026-09-21T09:15:00', last_result: '71 sign-ups this quarter · 2 waiting for review' },
  { key: 'sheets', name: 'Google Sheets: Program tracker', kind: 'spreadsheet', status: 'connected', mode: 'live', detail: 'One clean export of kids, attendance and hours. Replaces the copy-paste spreadsheet.', last_sync_at: '2026-09-22T07:00:00', last_result: 'Exported 62 kids, 512 attendance lines' },
  { key: 'mailchimp', name: 'Mailchimp: Family newsletter', kind: 'email', status: 'connected', mode: 'sandbox', detail: 'Keeps the family audience in sync, tagged by language and program.', last_sync_at: '2026-09-01T09:00:00', last_result: '37 contacts · tags ES 20, HT 11, EN 6' },
  { key: 'calendar', name: 'Session calendar (.ics)', kind: 'calendar', status: 'connected', mode: 'live', detail: 'Subscribe in Google or Apple Calendar. Mentors see their sessions.', last_sync_at: null, last_result: null },
  { key: 'quickbooks', name: 'QuickBooks: In-kind volunteer time', kind: 'accounting', status: 'connected', mode: 'sandbox', detail: 'Volunteer hours valued at the Florida rate for the in-kind line on grant budgets.', last_sync_at: '2026-07-01T09:00:00', last_result: 'Q4 FY26 posted' },
  { key: 'crm', name: 'Donor CRM', kind: 'crm', status: 'available', mode: 'sandbox', detail: 'Share program outcomes with the development team for grant reports.', last_sync_at: null, last_result: null },
];

/* ---------- sample sheets for the capture screen ---------- */
// Sep 23 Citrus Grove sheet (the live demo input) — exact rows, as Luis wrote them.
const SEP23_ROWS = [
  ['dariel', 'Dariel Rmz', 'absent'], ['camila', 'Camila Delgado', 'absent'], ['joshua', 'Josh Carter', 'present'],
  ['sofiaf', 'Sofia Fernandez', 'present'], ['kevin', 'Kevin Nguyen', 'present'], ['mateo', 'Mateo Hernandez', 'present'],
  ['ashley', 'Ashley Pierre-Louis', 'present'], [null, 'Yaneli P.', 'present'], ['jaden', 'Jaden Augustin', 'present'],
  ['valeria', 'Valeria Ramos', 'present'], ['danield', 'D. Desir', 'unclear'], ['brianna', 'Brianna Castillo', 'present'],
  ['andres', 'Andres F.', 'present'], ['nia', 'Nia Carter', 'present'],
];
const demoSheet = { key: 'cg-2026-09-23', program: 'mentoring', site: SITES.CG.name, siteKey: 'CG', held_at: '2026-09-23', start_time: '16:00', facilitator: 'Luis Oyola', facilitator_key: 'luis', hand: 'caveat',
  rows: SEP23_ROWS.map(([kk, raw, mark], i) => ({ row_index: i + 1, kid_key: kk, kid_id: kk ? K[kk].id : null, raw_text: raw, mark })) };

/* ---------- output ---------- */
const sessionsOut = sessions.map((s) => ({ ...s, photo_key: s.program === 'counseling' ? null : `sheets/s${s.id}.jpg` }));
const out = { generated_at: new Date().toISOString(), today: TODAY, quarter: { start: Q_START, end: Q_END }, families, kids, mentors, matches, sessions: sessionsOut, attendance, hours, signups, aliases, statusHistory, followups, contacts, messages, messageEvents, activity, integrations, demoSheet, samples: [] };
mkdirSync(join(ROOT, 'seed'), { recursive: true });
writeFileSync(join(ROOT, 'seed/seed.json'), JSON.stringify(out, null, 1));
console.log(`families ${families.length} · kids ${kids.length} · mentors ${mentors.length} · matches ${matches.length} · sessions ${sessions.length} · attendance ${attendance.length} · hours ${hours.length} · signups ${signups.length} · aliases ${aliases.length} · followups ${followups.length} · messages ${messages.length}`);
const served = new Set(attendance.filter((a) => a.mark === 'present' && a.kid_id).map((a) => a.kid_id));
console.log(`kids with attendance: ${served.size}; dupes: ${hours.filter((h) => h.superseded_by).length}`);
