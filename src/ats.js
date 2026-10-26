// Free utility: pull ATS-style keywords out of a job description and, optionally,
// report which of them a resume is missing. Pure text analysis, nothing stored.

const STOP = new Set(`a about above across after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each either etc few for from further had has have having he her here hers him his how i if in into is it its itself just least less like make many may me more most must my no nor not now of off on once only or other our ours out over own per plus please same she should so some such than that the their them then there these they this those through to too under until up upon us very via was we were what when where which while who whom why will with within without would yet you your yours
ability able experience experiences years year work working team teams role roles job jobs candidate candidates company opportunity opportunities including include includes strong excellent good great well new using use used based ensure help support related relevant required requirements requirement preferred nice responsibilities responsibility qualifications qualification skills skill knowledge understanding familiarity proficiency proficient deep solid proven track record day days week weeks time join looking seeking ideal successful bonus equivalent degree minimum expert complex advanced`.split(/\s+/));

// Generic words that only count inside a longer phrase.
const SINGLE_STOP = new Set("data product business senior junior lead expert complex build write design partner define analyze manage management communication stakeholder stakeholders tests testing programs program growth marketing".split(" "));

const SECTION_REQ = /(require|qualif|must|what you( will)? need|you have|you bring|minimum|basic)/i;
const SECTION_PREF = /(prefer|nice to have|bonus|plus|desired|good to have)/i;
const SECTION_DUTY = /(responsib|what you('ll| will) do|duties|the role|day to day)/i;

function tokens(line) {
  return (line.match(/[A-Za-z][A-Za-z0-9+#./-]*[A-Za-z0-9+#]|[A-Za-z]/g) || []).map((t) => t.replace(/[.,/-]+$/, ""));
}

const isTechy = (t) => /[0-9+#.]/.test(t) || /^[A-Z]{2,}[a-z]?$/.test(t) || /[a-z][A-Z]/.test(t);

export function atsKeywords(jd, resume, limit = 25) {
  const text = String(jd || "").slice(0, 20000);
  if (text.trim().length < 80) return { error: "Paste the full job description text (at least a few sentences)." };
  const n = Math.min(Math.max(Number(limit) || 25, 5), 50);
  const score = new Map();
  const where = new Map();
  let section = "body";
  const bump = (key, display, w, sec) => {
    const cur = score.get(key) || { display, w: 0, count: 0 };
    cur.w += w;
    cur.count += 1;
    if (isTechy(display) && !isTechy(cur.display)) cur.display = display;
    score.set(key, cur);
    const s = where.get(key) || new Set();
    s.add(sec);
    where.set(key, s);
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.length < 60 && SECTION_PREF.test(line)) section = "preferred";
    else if (line.length < 60 && SECTION_REQ.test(line)) section = "required";
    else if (line.length < 60 && SECTION_DUTY.test(line)) section = "responsibilities";
    const lineW = section === "required" ? 3 : section === "preferred" ? 1.5 : section === "responsibilities" ? 2 : 1;
    const words = tokens(line).map((t) => ({ t, k: t.toLowerCase() }));
    for (let i = 0; i < words.length; i++) {
      const { t, k } = words[i];
      const strong = isTechy(t) || (i > 0 && /^[A-Z][a-z]{2,}$/.test(t));
      if (!STOP.has(k) && !SINGLE_STOP.has(k) && k.length > 1) bump(k, t, lineW * (strong ? 2 : 1), section);
      for (const len of [2, 3]) {
        const slice = words.slice(i, i + len);
        if (slice.length < len) continue;
        if (slice.some((w) => STOP.has(w.k))) continue;
        if (slice.some((w) => w.k.length < 2)) continue;
        bump(slice.map((w) => w.k).join(" "), slice.map((w) => w.t).join(" "), lineW * 1.3, section);
      }
    }
  }
  const ranked = [...score.entries()]
    .filter(([k, v]) => v.count > 1 || isTechy(v.display) || /^[A-Z][a-z]{2,}$/.test(v.display) || where.get(k).has("required"))
    .map(([k, v]) => ({ key: k, keyword: v.display, weight: Math.round(v.w * 10) / 10, mentions: v.count, sections: [...where.get(k)].filter((s) => s !== "body") }))
    .sort((a, b) => b.weight - a.weight);
  // Drop a phrase or word when a longer phrase containing it is seen at least as often.
  const contains = (big, small) => big !== small && (" " + big + " ").includes(" " + small + " ");
  const kept = ranked.filter((r) => !ranked.some((o) => contains(o.key, r.key) && o.mentions >= r.mentions));
  const out = kept.slice(0, n);
  const years = [...new Set((text.match(/\b\d{1,2}\+?\s*(?:-\s*\d{1,2}\s*)?years?\b[^.\n]{0,40}/gi) || []).map((s) => s.trim()))].slice(0, 5);
  const result = {
    keywords: out.map(({ key, ...rest }) => rest),
    experience_requirements: years,
    method: "Frequency and section-weighted extraction (requirements weigh more than body text). Heuristic and English-focused; real ATS systems vary.",
  };
  if (resume && String(resume).trim()) {
    const r = " " + String(resume).slice(0, 20000).toLowerCase().replace(/\.(?![a-z0-9])/g, " ").replace(/[^a-z0-9+#.]+/g, " ") + " ";
    const has = (k) => r.includes(" " + k.replace(/[^a-z0-9+#. ]+/g, " ") + " ");
    const present = out.filter((o) => has(o.key)).map((o) => o.keyword);
    const missing = out.filter((o) => !has(o.key)).map((o) => o.keyword);
    result.resume_match = { matched: present.length, total: out.length, coverage_pct: Math.round((present.length / Math.max(out.length, 1)) * 100), present, missing };
  }
  return result;
}
