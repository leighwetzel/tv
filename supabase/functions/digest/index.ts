// digest: the Sunday email.
//
// Who gets what:
//   1. New picks (last week) from people you follow, best first: each Loved counts 2, each Liked 1.
//   2. Fewer than 3? Top up with "Popular on TV Rex": the best-scored picks from everyone else.
//   Skipped: titles you've rated, are watching or saved, and any title already in one of your emails.
//   Nothing left: no email that week.
//
// Called three ways:
//   POST {mode:"send"}               from the weekly GitHub Action. Sends only on Sunday 8–11 a.m. Pacific,
//                                    once per person per week. {force:true} skips the time check.
//   POST {mode:"test", as?:"Rick"}   sends the hosts a copy (of their own email, or of Rick's). Logs nothing.
//   POST ?u=<id>&t=<token>           turns the email off: the app's Stop page, or a mail app's one-click unsubscribe.
//                                    A GET only redirects to that page, so link scanners can't unsubscribe anyone.
// POST calls need the DIGEST_KEY GitHub secret (checked against its hash below) or the service role key. Deployed with --no-verify-jwt so the
// unsubscribe link works from an email, where nobody is signed in.
//
// Secrets: RESEND_API_KEY (Resend > API Keys, sending access). TMDB_TOKEN is already set for the tmdb function.

import { createClient } from 'npm:@supabase/supabase-js@2';

const APP = 'https://tv.xoleigh.com';
const FROM = 'TV Rex <tv@xoleigh.com>';
const IMG = 'https://image.tmdb.org/t/p/w154';
const TZ = 'America/Los_Angeles';
// Every link in the email carries UTM tags for Google Analytics. The query goes before the # route.
let campaign = 'sunday';
const link = (route: string, content: string) =>
  `${APP}/?utm_source=tv-rex&utm_medium=email&utm_campaign=${campaign}&utm_content=${content}${route ? '#' + route : ''}`;
const SHOW = 3;            // titles per email, at most
const REVIEWS_PER_CARD = 3;
const DAY = 24 * 60 * 60 * 1000;

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// SHA-256 of the DIGEST_KEY GitHub Actions secret. Only the hash lives here, so the public repo doesn't expose the key.
const CALL_KEY_SHA256 = 'e767ea4589ac32d1ea51a9df666c65cc7cd8749a3aab674213d738e3a4ec8076';
async function sha256(x: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const FN_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/digest`;
const admin = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY);

const SCORE: Record<string, number> = { loved: 2, liked: 1, didnt_like: 0, gave_up: 0 };
const WORD: Record<string, string> = { loved: 'loved it', liked: 'liked it', didnt_like: "didn't like it", gave_up: 'gave up' };

// ------------------------------------------------------------------ helpers

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function laParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { weekday: p.weekday, hour: Number(p.hour), date: `${p.year}-${p.month}-${p.day}` };
}
const longDate = (d = new Date()) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(d);

function ago(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY);
  if (days < 1) return 'today';
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

async function token(userId: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('unsub:' + userId)));
  return [...sig.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Footer link: a page in the app that asks before turning the email off (link scanners can't trip it).
const unsubPage = async (id: string) => `${APP}/#/unsubscribe/${encodeURIComponent(id)}/${await token(id)}`;
// List-Unsubscribe header: mail apps' one-click unsubscribe POSTs here.
const unsubUrl = async (id: string) => `${FN_URL}?u=${encodeURIComponent(id)}&t=${await token(id)}`;

// Same cleanup as the tmdb function: one clean name per service, no rent/buy stores.
const NOT_SERVICES = /justwatch|store|amazon video|google play|fandango|vudu|microsoft|spectrum|directv|^youtube$|plex channel/i;
function serviceName(raw: string) {
  const n = raw
    .replace(/\s+(amazon|apple tv|roku premium|prime video)\s+channel$/i, '')
    .replace(/\s+(standard|basic)?\s*with ads$/i, '')
    .replace(/\s+(premium plus|premium|essential)$/i, '')
    .trim();
  const alias: Record<string, string> = {
    'max': 'HBO Max', 'hbo max': 'HBO Max', 'disney plus': 'Disney+', 'paramount plus': 'Paramount+',
    'amazon prime video': 'Prime Video', 'prime video': 'Prime Video', 'apple tv plus': 'Apple TV', 'apple tv+': 'Apple TV',
    'peacock': 'Peacock', 'mgm plus': 'MGM+', 'amc plus': 'AMC+', 'starz': 'Starz',
  };
  return alias[n.toLowerCase()] ?? n;
}

async function servicesFor(ids: string[]) {
  const out = new Map<string, string[]>();
  if (!ids.length) return out;
  const { data } = await admin.from('title_providers').select('title_id, providers, fetched_at').in('title_id', ids);
  const have = new Map((data ?? []).filter((r) => Date.now() - Date.parse(r.fetched_at) < 3 * DAY).map((r) => [r.title_id, r.providers]));
  await Promise.all(ids.filter((id) => !have.has(id)).map(async (id) => {
    const [type, num] = id.split(':');
    try {
      const res = await fetch(`https://api.themoviedb.org/3/${type}/${num}/watch/providers`, { headers: { Authorization: `Bearer ${Deno.env.get('TMDB_TOKEN')}` } });
      const us = (await res.json()).results?.US;
      const slim = (a: any[] = []) => a.map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path }));
      const providers = { flatrate: slim(us?.flatrate), rent: slim(us?.rent), buy: slim(us?.buy), link: us?.link ?? null };
      have.set(id, providers);
      await admin.from('title_providers').upsert({ title_id: id, providers, fetched_at: new Date().toISOString() });
    } catch { /* no streaming line for this one */ }
  }));
  for (const id of ids) {
    const names = [...new Set(((have.get(id)?.flatrate ?? []) as any[]).map((p) => p.name).filter((n) => !NOT_SERVICES.test(n)).map(serviceName))];
    out.set(id, names.slice(0, 2));
  }
  return out;
}

// ------------------------------------------------------------------ choosing titles

type Rating = { user_id: string; title_id: string; rating: string; note: string | null; activity_at: string };
type Pick = { title: any; reviews: Rating[]; followed: boolean; score: number; latest: number };

async function loadWorld() {
  const since = new Date(Date.now() - 14 * DAY).toISOString();
  const [{ data: members, error: e1 }, { data: ratings, error: e2 }, { data: follows, error: e3 }, { data: sends, error: e4 }, users] = await Promise.all([
    admin.from('profiles').select('id, name, is_host, weekly_email').eq('is_member', true),
    admin.from('ratings').select('user_id, title_id, rating, note, activity_at').gte('activity_at', since),
    admin.from('follows').select('follower, followee'),
    admin.from('email_sends').select('user_id, sent_at').order('sent_at', { ascending: false }),
    listUsers(),
  ]);
  const err = e1 ?? e2 ?? e3 ?? e4;
  if (err) throw new Error(`Database: ${err.message}`);
  const people = new Map((members ?? []).map((m) => [m.id, m]));
  const recent = (ratings ?? []).filter((r) => people.has(r.user_id));
  const titleIds = [...new Set(recent.map((r) => r.title_id))];
  const { data: titles } = titleIds.length ? await admin.from('titles').select('*').in('id', titleIds) : { data: [] };
  const following = new Map<string, Set<string>>();
  for (const f of follows ?? []) (following.get(f.follower) ?? following.set(f.follower, new Set()).get(f.follower)!).add(f.followee);
  const lastSent = new Map<string, string>();
  for (const s of sends ?? []) if (!lastSent.has(s.user_id)) lastSent.set(s.user_id, s.sent_at);
  return { people, recent, titles: new Map((titles ?? []).map((t) => [t.id, t])), following, lastSent, emails: users };
}

async function listUsers() {
  const emails = new Map<string, string>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (u.email) emails.set(u.id, u.email);
    if (data.users.length < 200) break;
  }
  return emails;
}

async function picksFor(userId: string, world: Awaited<ReturnType<typeof loadWorld>>, { ignoreHistory = false } = {}) {
  const [{ data: mine }, { data: list }, { data: emailed }] = await Promise.all([
    admin.from('ratings').select('title_id').eq('user_id', userId),
    admin.from('watchlist').select('title_id').eq('user_id', userId),
    ignoreHistory ? Promise.resolve({ data: [] as any[] }) : admin.from('email_titles').select('title_id').eq('user_id', userId),
  ]);
  const skip = new Set([...(mine ?? []), ...(list ?? []), ...(emailed ?? [])].map((r: any) => r.title_id));
  // New since your last email (at most two weeks back; a week for a first email).
  const since = Math.max(Date.parse(world.lastSent.get(userId) ?? new Date(Date.now() - 7 * DAY).toISOString()), Date.now() - 14 * DAY);
  const follows = world.following.get(userId) ?? new Set<string>();

  const byTitle = new Map<string, Rating[]>();
  for (const r of world.recent) {
    if (r.user_id === userId || skip.has(r.title_id) || !world.titles.has(r.title_id)) continue;
    if (Date.parse(r.activity_at) < since) continue;
    (byTitle.get(r.title_id) ?? byTitle.set(r.title_id, []).get(r.title_id)!).push(r);
  }

  const followedPicks: Pick[] = [];
  const popular: Pick[] = [];
  for (const [id, rs] of byTitle) {
    const fromFollowed = rs.filter((r) => follows.has(r.user_id));
    const fromOthers = rs.filter((r) => !follows.has(r.user_id));
    const followedScore = fromFollowed.reduce((s, r) => s + SCORE[r.rating], 0);
    const otherScore = fromOthers.reduce((s, r) => s + SCORE[r.rating], 0);
    const order = (a: Rating, b: Rating) => Number(follows.has(b.user_id)) - Number(follows.has(a.user_id)) || SCORE[b.rating] - SCORE[a.rating] || Date.parse(b.activity_at) - Date.parse(a.activity_at);
    const latest = Math.max(...rs.map((r) => Date.parse(r.activity_at)));
    // From people you follow: only their reviews on the card. Popular: everyone's.
    if (followedScore > 0) followedPicks.push({ title: world.titles.get(id), reviews: fromFollowed.sort(order).slice(0, REVIEWS_PER_CARD), followed: true, score: followedScore, latest });
    else if (otherScore > 0) popular.push({ title: world.titles.get(id), reviews: [...rs].sort(order).slice(0, REVIEWS_PER_CARD), followed: false, score: otherScore, latest });
  }
  const best = (a: Pick, b: Pick) => b.score - a.score || b.latest - a.latest;
  followedPicks.sort(best);
  popular.sort(best);
  const fromFollowed = followedPicks.slice(0, SHOW);
  const topUp = popular.slice(0, Math.max(0, SHOW - fromFollowed.length));
  return { fromFollowed, popular: topUp, follows, more: followedPicks.length - fromFollowed.length };
}

// ------------------------------------------------------------------ the email

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const C = { blue: '#2864B4', page: '#F1F4F8', card: '#FFFFFF', line: '#DCE2E8', ink: '#2B2B2B', muted: '#626970', tint: '#E4EEF9' };

const button = (href: string, label: string, primary = true) =>
  `<a href="${esc(href)}" style="display:block;text-align:center;padding:14px 16px;border-radius:12px;font-size:17px;font-weight:600;text-decoration:none;${primary ? `background:${C.blue};color:#FFFFFF;` : `background:${C.card};color:${C.blue};border:1px solid ${C.line};`}">${esc(label)}</a>`;

function card(p: Pick, names: Map<string, any>, services: string[], follows: Set<string>) {
  const t = p.title;
  const kind = `${t.media_type === 'tv' ? 'TV' : 'Movie'}${t.year ? ` · ${t.year}` : ''}`;
  const poster = t.poster_path
    ? `<img src="${IMG}${esc(t.poster_path)}" width="64" height="96" alt="" style="display:block;width:64px;height:96px;border-radius:10px;object-fit:cover">`
    : `<div style="width:64px;height:96px;border-radius:10px;background:#E9EDF1"></div>`;
  const tags = services.map((s) => `<span style="display:inline-block;background:${C.tint};color:${C.blue};font-size:14px;font-weight:600;padding:4px 10px;border-radius:999px;margin:0 6px 0 0">${esc(s)}</span>`).join('');
  const reviews = p.reviews.map((r) => {
    const name = names.get(r.user_id)?.name || 'Someone';
    const note = (r.note ?? '').trim();
    const short = note.length > 280 ? note.slice(0, 277).trimEnd() + '…' : note;
    const follow = follows.has(r.user_id) ? '' :
      `<td width="96" valign="top" align="right"><a href="${esc(link(`/friend/${encodeURIComponent(r.user_id)}`, 'follow'))}" style="display:inline-block;padding:11px 12px;border:1px solid ${C.line};border-radius:8px;color:${C.blue};font-size:15px;font-weight:600;text-decoration:none;white-space:nowrap">+ Follow</a></td>`;
    return `<tr><td colspan="2" style="padding:12px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="46" valign="top"><div style="width:36px;height:36px;line-height:36px;border-radius:18px;background:${C.tint};color:${C.blue};font-size:15px;font-weight:700;text-align:center">${esc(name.slice(0, 1).toUpperCase())}</div></td>
      <td valign="top" style="font-family:${FONT}">
        <div style="font-size:17px;color:${C.ink}"><b style="font-weight:750">${esc(name)}</b> ${WORD[r.rating]} <span style="font-size:15px;color:${C.muted}">· ${ago(r.activity_at)}</span></div>
        ${short ? `<div style="font-size:20px;line-height:1.35;color:${C.ink};padding-top:2px">${esc(short)}</div>` : ''}
      </td>${follow}</tr></table></td></tr>`;
  }).join('');
  return `<tr><td style="padding:0 12px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:14px"><tr><td style="padding:12px;font-family:${FONT}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="76" valign="top"><a href="${esc(link(`/title/${encodeURIComponent(t.id)}`, 'poster'))}">${poster}</a></td>
      <td valign="top">
        <div style="font-size:22px;font-weight:750;line-height:1.2;color:${C.ink}">${esc(t.name)}</div>
        <div style="font-size:15px;color:${C.muted};padding:4px 0 6px">${esc(kind)}</div>
        ${tags}
      </td></tr>
      ${reviews}
      <tr><td style="padding-top:14px" colspan="2">${button(link(`/title/${encodeURIComponent(t.id)}/save`, 'want-to-watch'), '+ Want to watch', false)}</td></tr>
    </table>
  </td></tr></table></td></tr>`;
}

const heading = (text: string, sub = '') =>
  `<tr><td style="padding:22px 16px ${sub ? '2px' : '8px'};font-family:${FONT};font-size:15px;font-weight:600;color:${C.ink}">${esc(text)}</td></tr>` // same as "Everything" in the app's Showing line +
  (sub ? `<tr><td style="padding:0 16px 10px;font-family:${FONT};font-size:15px;color:${C.muted}">${esc(sub)}</td></tr>` : '');

// unsubFor: whose unsubscribe link goes in the email (a test copy carries the host's own, never the person's).
async function buildEmail(person: any, picks: Awaited<ReturnType<typeof picksFor>>, names: Map<string, any>, unsubFor: string = person.id) {
  const all = [...picks.fromFollowed, ...picks.popular];
  const services = await servicesFor(all.map((p) => p.title.id));
  const first = (person.name || '').split(' ')[0];
  const n = picks.fromFollowed.length;
  const total = n + picks.more;
  const lead = n
    ? `${total} new ${total === 1 ? 'pick' : 'picks'} from people you follow this week${picks.more ? `. Here are the top ${n}` : picks.popular.length ? ", plus what's popular on TV Rex" : ''}.`
    : "Nothing new from people you follow this week, so here's what's popular on TV Rex.";
  const top = picks.fromFollowed[0] ?? picks.popular[0];
  const topName = names.get(top.reviews[0].user_id)?.name || 'Someone';
  const subject = n
    ? `${topName} ${top.reviews[0].rating === 'loved' ? 'loved' : 'liked'} ${top.title.name}${total > 1 ? ` and ${total - 1} more` : picks.popular.length ? ", plus what's popular on TV Rex" : ''}`
    : `Popular on TV Rex: ${top.title.name}${all.length > 1 ? ` and ${all.length - 1} more` : ''}`;
  const preheader = n
    ? `${total} from people you follow${picks.popular.length ? `, ${picks.popular.length} popular` : ''}`
    : `${all.length} popular ${all.length === 1 ? 'pick' : 'picks'} you haven't seen`;
  const unsub = await unsubUrl(unsubFor);
  const unsubLink = await unsubPage(unsubFor);

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border-bottom:1px solid ${C.line}"><tr><td align="center" style="padding:16px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:0 16px;font-family:${FONT}">
    <a href="${esc(link('', 'header'))}" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td><img src="${APP}/apple-touch-icon.png" width="44" height="44" alt="" style="display:block;border-radius:10px"></td>
      <td style="padding-left:12px"><div style="font-size:23px;font-weight:700;color:${C.ink}">TV Rex</div><div style="font-size:15px;color:${C.muted}">${esc(longDate())}</div></td>
    </tr></table></a>
  </td></tr></table>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  ${n ? heading(`From people you follow${picks.more ? ` · top ${n} of ${total}` : ''}`) + picks.fromFollowed.map((p) => card(p, names, services.get(p.title.id) ?? [], picks.follows)).join('') : ''}
  ${picks.more ? `<tr><td align="center" style="padding:8px 16px 0;font-family:${FONT};font-size:17px"><a href="${esc(link('/feed', 'see-more'))}" style="color:${C.blue};font-weight:600;text-decoration:none">See ${picks.more} more in TV Rex ›</a></td></tr>` : ''}
  ${picks.popular.length ? heading('Popular on TV Rex', "From people you don't follow yet") + picks.popular.map((p) => card(p, names, services.get(p.title.id) ?? [], picks.follows)).join('') : ''}
  <tr><td style="padding:16px 12px 0">${button(link('', 'open-app'), 'Open TV Rex')}</td></tr>
  <tr><td style="padding:20px 16px 0;font-family:${FONT};font-size:20px;line-height:1.4;color:${C.ink}">
    Watched something good lately? <a href="${esc(link('/add', 'add-it'))}" style="color:${C.blue};font-weight:600">Add it</a> so the people who follow you see it next Sunday.
  </td></tr>
  <tr><td style="padding:28px 16px 32px;font-family:${FONT};font-size:15px;line-height:1.4;color:${C.muted}">
    <div style="border-top:1px solid ${C.line};padding-top:20px">You get this on Sundays when there are new picks from people you follow, or popular ones you haven't seen. Nothing new, no email.</div>
    <div style="padding-top:8px"><a href="${esc(unsubLink)}" style="color:${C.blue}">Unsubscribe</a> · <a href="${esc(link('', 'footer'))}" style="color:${C.blue}">tv.xoleigh.com</a></div>
    <div style="padding-top:8px">Streaming info from JustWatch.</div>
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    first ? `Hi ${first},` : '', lead, '',
    ...all.map((p) => [`${p.title.name} (${p.title.media_type === 'tv' ? 'TV' : 'Movie'})${(services.get(p.title.id) ?? []).length ? ' · ' + services.get(p.title.id)!.join(', ') : ''}`,
      ...p.reviews.map((r) => `  ${names.get(r.user_id)?.name || 'Someone'} ${WORD[r.rating]}${r.note ? ': ' + r.note : ''}`),
      `  ${link(`/title/${encodeURIComponent(p.title.id)}`, 'text-title')}`, ''].join('\n')),
    `Open TV Rex: ${link('', 'text-open-app')}`, `Unsubscribe: ${unsubLink}`,
  ].join('\n');

  return { subject, html, text, unsub, titleIds: all.map((p) => p.title.id) };
}

async function send(to: string, email: { subject: string; html: string; text: string; unsub: string }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM, to: [to], subject: email.subject, html: email.html, text: email.text,
        headers: { 'List-Unsubscribe': `<${email.unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }),
    });
    if (res.ok) return;
    if (res.status === 429) { await sleep(1500); continue; }
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
  throw new Error('Resend kept rate-limiting');
}

// ------------------------------------------------------------------ entry points

async function runSend(force: boolean) {
  const now = laParts();
  campaign = `sunday-${now.date}`;
  if (!force && !(now.weekday === 'Sun' && now.hour >= 8 && now.hour < 11)) return { skipped: `Not Sunday morning Pacific (${now.weekday} ${now.hour}:00)` };
  const world = await loadWorld();
  const { data: done, error: logErr } = await admin.from('email_sends').select('user_id').eq('week', now.date);
  if (logErr) return { error: `Run migration 018 first (${logErr.message})` }; // without the log, a retry would send twice
  const already = new Set((done ?? []).map((d) => d.user_id));
  const report = { week: now.date, sent: 0, nothing_new: 0, already_sent: 0, no_email: 0, errors: [] as string[] };

  for (const person of world.people.values()) {
    if (!person.weekly_email) continue;
    if (already.has(person.id)) { report.already_sent++; continue; }
    const to = world.emails.get(person.id);
    if (!to) { report.no_email++; continue; }
    try {
      const picks = await picksFor(person.id, world);
      if (!picks.fromFollowed.length && !picks.popular.length) { report.nothing_new++; continue; }
      const email = await buildEmail(person, picks, world.people);
      await send(to, email);
      const { error: sendLogErr } = await admin.from('email_sends').insert({ user_id: person.id, week: now.date, title_count: email.titleIds.length });
      if (sendLogErr) { report.errors.push(`Stopped: couldn't log the send (${sendLogErr.message})`); break; }
      await admin.from('email_titles').upsert(email.titleIds.map((title_id) => ({ user_id: person.id, title_id })), { ignoreDuplicates: true });
      report.sent++;
      await sleep(600); // stay under Resend's per-second limit
    } catch (e) {
      report.errors.push(`${person.name || person.id}: ${String((e as Error)?.message ?? e)}`);
    }
  }
  return report;
}

async function runTest(as?: string) {
  campaign = `test-${laParts().date}`;
  const world = await loadWorld();
  const hosts = [...world.people.values()].filter((p) => p.is_host);
  // "Rick", "rick" or "Rick Wetzel" all find Rick: full name first, then first name.
  const norm = (x: string) => x.trim().toLowerCase();
  const people = [...world.people.values()];
  const target = !as ? null
    : people.find((p) => norm(p.name || '') === norm(as))
      ?? people.find((p) => norm(p.name || '').split(/\s+/)[0] === norm(as).split(/\s+/)[0]) ?? null;
  if (as && !target) return { error: `No member named ${as}`, members: people.map((p) => p.name || '(no name)').sort() };
  const out: string[] = [];
  for (const host of hosts) {
    const person = target ?? host;
    const picks = await picksFor(person.id, world);
    if (!picks.fromFollowed.length && !picks.popular.length) { out.push(`${person.name}: nothing new this week, so no email`); continue; }
    const email = await buildEmail(person, picks, world.people, host.id);
    const to = world.emails.get(host.id);
    if (!to) continue;
    await send(to, { ...email, subject: `[Test${target ? ` for ${person.name}` : ''}] ${email.subject}` });
    out.push(`Sent ${person.name}'s email to ${host.name}`);
    await sleep(600);
  }
  return { test: out };
}

async function unsubscribe(url: URL) {
  const u = url.searchParams.get('u') ?? '';
  const t = url.searchParams.get('t') ?? '';
  if (!u || t !== await token(u)) return false;
  const { error } = await admin.from('profiles').update({ weekly_email: false }).eq('id', u);
  return !error;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  try {
    const cors = { 'Access-Control-Allow-Origin': APP, 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.searchParams.has('u')) {
      // Only a POST turns the email off (the app's button, or a mail app's one-click unsubscribe).
      // A GET (someone or a link scanner opening the URL) goes to the app's page, which asks first.
      if (req.method === 'POST') {
        const ok = await unsubscribe(url);
        return new Response(ok ? 'ok' : 'bad link', { status: ok ? 200 : 400, headers: cors });
      }
      return Response.redirect(`${APP}/#/unsubscribe/${encodeURIComponent(url.searchParams.get('u') ?? '')}/${encodeURIComponent(url.searchParams.get('t') ?? '')}`, 302);
    }
    const bearer = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    if (req.method !== 'POST' || !bearer || (bearer !== SERVICE_KEY && await sha256(bearer) !== CALL_KEY_SHA256)) return new Response('Not allowed', { status: 401 });
    const body = await req.json().catch(() => ({}));
    const result = body.mode === 'test' ? await runTest(body.as || undefined) : body.mode === 'send' ? await runSend(!!body.force) : { error: 'mode must be send or test' };
    return new Response(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
