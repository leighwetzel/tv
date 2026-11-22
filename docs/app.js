import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.0'; // pinned: passkeys (Face ID) are new
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
});

// ---------------------------------------------------------------- helpers

const $app = document.getElementById('app');
const $nav = document.getElementById('nav');
const IMG = 'https://image.tmdb.org/t/p/';
const RATING = { loved: 'Loved', liked: 'Liked', didnt_like: "Didn't like", gave_up: 'Gave up' };
const POSITIVE = ['loved', 'liked'];
const NOT_SERVICES = /justwatch|store|amazon video|google play|fandango|vudu|microsoft|spectrum|directv|^youtube$|plex channel/i;
function serviceName(raw) {
  const n = String(raw)
    .replace(/\s+(amazon|apple tv|roku premium|prime video)\s+channel$/i, '')
    .replace(/\s+(standard|basic)?\s*with ads$/i, '')
    .replace(/\s+(premium plus|premium|essential)$/i, '')
    .trim();
  const alias = { 'max': 'HBO Max', 'hbo max': 'HBO Max', 'disney plus': 'Disney+', 'paramount plus': 'Paramount+',
    'amazon prime video': 'Prime Video', 'prime video': 'Prime Video', 'apple tv plus': 'Apple TV', 'apple tv+': 'Apple TV',
    'mgm plus': 'MGM+', 'amc plus': 'AMC+' };
  return alias[n.toLowerCase()] ?? n;
}
// Subscription services for a title, one entry per clean name.
function subs(id) {
  const p = state.providers.get(id);
  const out = new Map();
  for (const s of p?.flatrate ?? []) {
    if (NOT_SERVICES.test(s.name)) continue;
    const name = serviceName(s.name);
    const e = out.get(name) ?? { name, ids: [] };
    e.ids.push(s.id); out.set(name, e);
  }
  return [...out.values()];
}
const ratingLabel = (r) => `${RATING[r.rating]}${r.season ? ' · S' + r.season : ''}`;
// Rating icons: heart for Loved, thumbs for Liked / Didn't like, zzz for Gave up (paths from Tabler Icons, MIT).
const ICON_PATH = {
  loved: '<path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"/>',
  liked: '<path d="M7 11v8a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1h3a4 4 0 0 0 4 -4v-1a2 2 0 0 1 4 0v5h3a2 2 0 0 1 2 2l-1 5a2 3 0 0 1 -2 2h-7a3 3 0 0 1 -3 -3"/>',
  didnt_like: '<path d="M7 13v-8a1 1 0 0 0 -1 -1h-2a1 1 0 0 0 -1 1v7a1 1 0 0 0 1 1h3a4 4 0 0 1 4 4v1a2 2 0 0 0 4 0v-5h3a2 2 0 0 0 2 -2l-1 -5a2 3 0 0 0 -2 -2h-7a3 3 0 0 0 -3 3"/>',
  gave_up: '<path d="M4 12h6l-6 8h6M14 4h6l-6 8h6"/>',
};
const ratingIcon = (k) => `<svg class="ricon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATH[k]}</svg>`;
// Icon plus word, no background, so it never looks like a button.
const ratingTag = (r) => `<span class="rtag r-${r.rating}">${ratingIcon(r.rating)}${ratingLabel(r)}</span>`;
// "♥ 5  👍 3" for a title; only ratings someone actually picked.
function tally(reviews) {
  const n = {};
  for (const r of reviews) n[r.rating] = (n[r.rating] ?? 0) + 1;
  const parts = Object.keys(RATING).filter((k) => n[k]).map((k) =>
    `<span class="rtag r-${k}" aria-label="${n[k]} ${RATING[k]}">${ratingIcon(k)}${n[k]}</span>`);
  return parts.length ? `<div class="tally">${parts.join('')}</div>` : '';
}
// Square avatar: their photo if they have one, otherwise initials on a color picked from their id.
const AV_COLORS = [['#E4EEF9', '#1F4E8C'], ['#E1F5EE', '#085041'], ['#FAECE7', '#712B13'], ['#EEEDFE', '#3C3489'], ['#FAEEDA', '#633806'], ['#FBEAF0', '#72243E']];
function avatar(id, p = state.people.get(id)) {
  if (p?.avatar_url) return `<img class="avatar" src="${esc(p.avatar_url)}" alt="">`;
  const words = (p?.name || '?').trim().split(/\s+/);
  const ini = (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = AV_COLORS[h % AV_COLORS.length];
  return `<span class="avatar" aria-hidden="true" style="background:${bg};color:${fg}">${esc(ini)}</span>`;
}
const isMine = (svc) => svc.ids.some((i) => myServices().includes(i));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Loading screen: Rex holds still while the remote's yellow lines flicker. Same markup as the first
// paint in index.html. Pass a line to show it as is; leave it out to rotate the quips.
const QUIPS = ['Flipping channels…', 'Asking your friends…', 'Skipping the intro…', 'Checking the couch cushions…', 'Finding the remote…', 'Rewinding…'];
const loader = (line) => `
  <div class="loader" role="status"><span class="sr-only">Loading</span>
    <div class="rex-load" aria-hidden="true"><img src="rex-loading.png?v=1" alt=""><svg viewBox="0 0 192 192">
      <line x1="159.9" y1="72.7" x2="154.3" y2="83.9" style="--sx:-3px;--sy:6px;--ex:2px;--ey:-4px"/>
      <line x1="172.1" y1="80.6" x2="162.7" y2="89.1" style="--sx:-4.5px;--sy:4px;--ex:3px;--ey:-3px"/>
      <line x1="177.6" y1="93.9" x2="169.3" y2="96.1" style="--sx:-6px;--sy:1.5px;--ex:4px;--ey:-1px"/>
    </svg></div>
    <p class="loader-q" aria-hidden="true"${line ? '' : ' data-rotate'}>${esc(line || QUIPS[0])}</p>
  </div>`;
setInterval(() => {
  const q = document.querySelector('.loader-q[data-rotate]');
  if (!q) return;
  const i = (Number(q.dataset.i) || 0) + 1;
  q.classList.add('fade');
  setTimeout(() => { q.dataset.i = i; q.textContent = QUIPS[i % QUIPS.length]; q.classList.remove('fade'); }, 250);
}, 1800);
const poster = (path, cls = '') => path
  ? `<img class="poster ${cls}" src="${IMG}${['xl', 'lg', 'tile'].includes(cls) ? 'w342' : 'w185'}${esc(path)}" alt="" loading="lazy">`
  : `<div class="poster ${cls}" aria-hidden="true"></div>`;
const kind = (t) => `${t.media_type === 'tv' ? 'TV' : 'Movie'}${t.year ? ' · ' + t.year : ''}`;
const BRAND = `<header class="brand">
  <img class="logo" src="icon.png?v=5" alt="">
  <div><h1>About TV Rex</h1><p class="tagline">Picks from friends and family</p></div></header>`;
const personLink = (id) => `<a class="person" href="#/friend/${encodeURIComponent(id)}">${esc(nameOf(id))}</a>`;
const SAVED = '<span class="btn saved">✓ Saved</span>';
const WATCHING = '<span class="btn saved">✓ Watching</span>'; // shown in place of + Want to watch once a title is on your list
const titleLink = (t) => `#/title/${encodeURIComponent(t.id)}`;

function when(ts) {
  const d = new Date(ts), mins = (Date.now() - d) / 60000;
  if (mins < 60) return `${Math.max(1, Math.round(mins))}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  const days = Math.floor(mins / (60 * 24));
  if (days < 7) return `${days}d`;
  if (days < 35) return `${Math.floor(days / 7)}w`;
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg; el.setAttribute('role', 'status');
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}

async function fn(action, body = {}) {
  const { data, error } = await sb.functions.invoke('tmdb', { body: { action, ...body } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// One click handler for the whole app: elements carry data-act="name".
const actions = {};
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !actions[el.dataset.act]) return;
  e.preventDefault();
  if (el.disabled) return;
  try { await actions[el.dataset.act](el.dataset, el); }
  catch (err) { console.error(err); toast('Something went wrong. Try again.'); }
});

const seasonCache = new Map();
async function fillSeasons() {
  for (const sel of document.querySelectorAll('select.season:not([data-filled])')) {
    sel.dataset.filled = '1';
    const id = sel.dataset.title;
    try {
      if (!seasonCache.has(id)) seasonCache.set(id, (await fn('tvinfo', { id })).seasons);
      const n = seasonCache.get(id) || 0;
      for (let i = 1; i <= n; i++) sel.insertAdjacentHTML('beforeend', `<option value="${i}">Through season ${i}${i === n ? ' (latest)' : ''}</option>`);
      sel.value = sel.dataset.current || '';
    } catch (e) { console.error(e); }
  }
}
new MutationObserver(() => fillSeasons()).observe(document.getElementById('app'), { childList: true, subtree: true });

// ---------------------------------------------------------------- state

const state = {
  session: null,
  me: null,               // my profile row
  people: new Map(),      // id -> profile (everyone you can see: all members)
  providers: new Map(),   // title id -> { flatrate, rent, buy }
  services: null,         // streaming service list from TMDB
  feedType: 'all', feedGenre: 'all', listGenre: 'all', feedSvc: 'all', listSvc: 'all', listType: 'all', feedSort: 'review', listSort: 'added', feedPeople: 'all',
  following: new Set(),   // ids you follow
};

const isMe = (id) => id === state.me?.id;
const nameOf = (id) => isMe(id) ? 'You' : (state.people.get(id)?.name || 'Someone');

// Other people's rows carry only their name and photo; your own settings come from my_settings().
async function loadPeople() {
  // All three requests at once: one wait instead of three in a row.
  const [{ data }, { data: mine }, { data: fl }] = await Promise.all([
    sb.from('profiles').select('id, name, avatar_url, is_host, onboarded'),
    sb.rpc('my_settings'),
    sb.from('follows').select('followee'),
  ]);
  state.people = new Map((data ?? []).map((p) => [p.id, p]));
  state.me = state.people.get(state.session.user.id) ?? null;
  if (!state.me) return;
  if (mine?.[0]) Object.assign(state.me, mine[0]);
  state.following = new Set((fl ?? []).map((f) => f.followee));
}

// Streaming info changes slowly, so keep it on the device for a day instead of asking TMDB on every open.
const PROVIDERS_KEY = 'tv_providers', DAY = 864e5;
function storeGet(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function storeSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage full or blocked: skip */ } }
(() => {
  const saved = storeGet(PROVIDERS_KEY) ?? {};
  for (const [id, e] of Object.entries(saved)) if (Date.now() - e.at < DAY) state.providers.set(id, e.p);
})();
function saveProviders(fresh) {
  const saved = storeGet(PROVIDERS_KEY) ?? {}, now = Date.now();
  for (const [id, e] of Object.entries(saved)) if (now - e.at >= DAY) delete saved[id];
  for (const [id, p] of Object.entries(fresh)) saved[id] = { p, at: now };
  storeSet(PROVIDERS_KEY, saved);
}
async function loadProviders(ids) {
  const missing = [...new Set(ids)].filter((id) => !state.providers.has(id));
  for (let i = 0; i < missing.length; i += 60) {
    try {
      const { providers } = await fn('providers', { ids: missing.slice(i, i + 60) });
      for (const [id, p] of Object.entries(providers)) state.providers.set(id, p);
      saveProviders(providers);
    } catch (e) { console.error(e); }
  }
}

const myServices = () => state.me?.services ?? [];
function onMyServices(id) { return subs(id).some(isMine); }
function watchOn(id) {
  const p = state.providers.get(id);
  if (!p) return '';
  const all = subs(id);
  if (all.length) {
    const mine = all.filter(isMine);
    const names = (mine.length ? mine : all).slice(0, 2).map((s) => esc(s.name)).join(', ');
    return `<span class="watch ${mine.length ? 'mine' : ''}">Watch on <strong>${names}</strong></span>`;
  }
  if (p.rent?.length || p.buy?.length) return '<span class="watch muted">Rent or buy only</span>';
  return '<span class="watch muted">Not streaming in the US</span>';
}

// ---------------------------------------------------------------- router

const routes = {
  feed: viewFeed, title: viewTitle, add: viewAdd,
  list: viewList, me: viewMe, invites: viewInvites, members: viewMembers, feedback: viewFeedback, friend: viewFriend, welcome: viewWelcome, about: viewAbout, following: viewFollowing, passkey: viewPasskey, help: viewHelp,
};

async function route() {
  if (/error_description/.test(location.hash)) {
    history.replaceState(null, '', location.pathname);
    toast('That sign-in link expired. Use the code instead.');
  }
  // From the Sunday email's Unsubscribe link. Works signed in or out.
  // Asks first: some email systems open every link to scan it, and that visit alone mustn't turn the email off.
  if (location.hash.startsWith('#/unsubscribe/')) {
    $nav.hidden = true;
    const [, , u, t] = location.hash.split('/');
    $app.innerHTML = `<section><h1>Unsubscribe from the Sunday email?</h1>
      <p>You’ll stop getting picks from TV Rex by email. You can turn it back on anytime on your Me page.</p>
      <p><button class="primary big" data-act="unsubscribe" data-u="${esc(u)}" data-t="${esc(t)}">Unsubscribe</button></p>
      <p><a href="#/feed">Keep getting it</a></p></section>`;
    return;
  }
  if (!state.session) {
    $nav.hidden = true;
    if (location.hash.startsWith('#/help')) return viewHelp();
    if (location.hash.startsWith('#/request')) return viewRequest();
    if (location.hash.startsWith('#/feedback')) return viewFeedback(location.hash.split('/')[2]); // Wiki Walk sends people here, signed in or not
    // Opened an invite link: explain TV Rex first. Join and Sign in both go to #/signin.
    if (localStorage.getItem('tv_invite') && !location.hash.startsWith('#/signin')) return viewInvite();
    return viewSignIn();
  }
  if (!state.me) await loadPeople();
  if (!state.me) { $app.innerHTML = '<p class="empty">Setting up your profile… refresh in a moment.</p>'; return; }

  if (/access_token|error_description/.test(location.hash)) return;
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  let view = routes[name] ? name : 'feed';
  if (state.me.is_member === false) { $nav.hidden = true; return name === 'request' ? viewRequest() : name === 'feedback' ? viewFeedback(rest[0]) : viewNotMember(); }
  if (!state.me.onboarded && view !== 'about' && view !== 'passkey' && view !== 'help') view = 'welcome';

  $nav.hidden = view === 'welcome';
  const tab = view === 'invites' ? 'me' : view;
  for (const a of $nav.querySelectorAll('a')) a.classList.toggle('on', a.dataset.tab === tab);
  window.scrollTo(0, 0);
  try { await routes[view](...rest.map(decodeURIComponent)); markLongNotes(); }
  catch (e) { console.error(e); $app.innerHTML = '<p class="empty">Couldn’t load this. Pull to refresh or try again.</p>'; }
  updateActivityDot();
}
window.addEventListener('hashchange', route);

async function updateActivityDot() {
  // Activity section was removed from Me (Nov 16), so only new invite requests light the dot.
  const [{ count: reqs }, { count: fb }] = await Promise.all([
    sb.from('invite_requests').select('id', { count: 'exact', head: true }).is('handled', null), // 0 unless you get requests
    sb.from('feedback').select('id', { count: 'exact', head: true }).is('resolved_at', null),   // 0 unless you're the inbox
  ]);
  const count = fb ?? 0;
  const me = $nav.querySelector('[data-tab=me]');
  me.querySelector('.dot')?.remove();
  if (count || reqs) me.insertAdjacentHTML('beforeend', '<span class="dot" aria-label="new activity"></span>');
}

// ---------------------------------------------------------------- sign in

// ---------------------------------------------------------------- Face ID (passkeys)
// A passkey lives in the phone's keychain, so it survives Safari clearing website data.
const canPasskey = () => !!window.PublicKeyCredential;
const bioName = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  ? 'Face ID' : /Macintosh/.test(navigator.userAgent) ? 'Touch ID' : 'your device';
const FACE_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 10v1M15 10v1M12 10v3h-1M9.5 16a3.5 3.5 0 0 0 5 0"/></svg>';

actions.passkeySignIn = async (d, el) => {
  el.disabled = true;
  const { error } = await sb.auth.signInWithPasskey();
  el.disabled = false;
  if (error) document.getElementById('passkeyMsg').textContent = `${bioName()} sign-in isn’t set up on this ${/iPad/.test(navigator.userAgent) ? 'iPad' : 'phone'} yet, or it was cancelled. Use the email code below.`;
  // success: Supabase signals SIGNED_IN and the app moves on by itself
};

// Offered once after signing in with an email code, if this person has no passkey yet.
async function shouldOfferPasskey() {
  if (!canPasskey()) return false;
  const later = Number(localStorage.getItem('tv_passkey_later') || 0);
  if (Date.now() - later < 30 * 864e5) return false;
  const { data, error } = await sb.auth.passkey.list();
  return !error && Array.isArray(data) && data.length === 0;
}
function viewPasskey() {
  $app.innerHTML = `
    <div class="card offer">
      <div class="offer-icon">${FACE_ICON}</div>
      <h1>Sign in with ${bioName()} next time?</h1>
      <p class="muted">No more email codes. One look at your ${/iPad/.test(navigator.userAgent) ? 'iPad' : 'phone'} and you’re in.</p>
      <button class="primary big" data-act="addPasskey">${FACE_ICON} Yes, use ${bioName()}</button>
      <button class="big" data-act="passkeyLater">Not now</button>
    </div>`;
}
actions.addPasskey = async (d, el) => {
  el.disabled = true;
  const { error } = await sb.auth.registerPasskey();
  el.disabled = false;
  if (error) return toast(`${bioName()} wasn’t set up. You can try again from Me.`);
  toast(`${bioName()} is set up`);
  if (location.hash === '#/passkey') location.hash = '#/feed'; else route();
};
actions.passkeyLater = () => { localStorage.setItem('tv_passkey_later', String(Date.now())); location.hash = '#/feed'; };

function viewSignIn(step = 'email', email = '') {
  if (step === 'email') {
    // Invite links lead to email only: a newcomer can't have Face ID set up yet.
    const offerFace = canPasskey() && !localStorage.getItem('tv_invite');
    $app.innerHTML = `
      ${BRAND}
      ${localStorage.getItem('tv_invite') ? '<a class="back-link" href="#/">← Back</a>' : ''}
      ${offerFace ? `<button class="primary big face" data-act="passkeySignIn">${FACE_ICON} Sign in with ${bioName()}</button>
      <p class="muted small" id="passkeyMsg" role="status"></p>
      <div class="or"><span>or get a code by email</span></div>` : ''}
      <form id="f" class="field">
        <label for="email">Your email</label>
        <input id="email" type="email" autocomplete="email" required value="${esc(email)}">
        <button class="${offerFace ? '' : 'primary '}big" type="submit">${offerFace ? 'Email me a code' : 'Send me a code'}</button>
      </form>
      ${localStorage.getItem('tv_invite') ? '' : `<div class="card newhere">
        <h2>New here?</h2>
        <p class="muted">TV Rex is invite-only. If you know someone on it, you can ask for an invite.</p>
        <a class="btn big" href="#/request">Request an invite</a></div>`}
      <a class="help-link" href="#/help">Need help signing in?</a>`;
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      const addr = document.getElementById('email').value.trim();
      const btn = e.target.querySelector('button'); btn.disabled = true;
      const { error } = await sb.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true } });
      if (error) { btn.disabled = false; return toast(error.message); }
      viewSignIn('code', addr);
    };
  } else {
    $app.innerHTML = `
      <h1>Check your email</h1>
      <p class="muted">We emailed a sign-in code to ${esc(email)}. It can take a minute to arrive; check spam if you don’t see it.</p>
      <form id="f" class="field">
        <label for="code">Code</label>
        <input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required>
        <button class="primary big" type="submit">Sign in</button>
        <button class="link" type="button" data-act="restart">Use a different email</button>
      </form>`;
    document.getElementById('code').focus();
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      const token = document.getElementById('code').value.replace(/\s/g, '');
      const btn = e.target.querySelector('button'); btn.disabled = true;
      state.codeSignIn = true; // offer Face ID once this sign-in lands
      const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
      if (error) { state.codeSignIn = false; btn.disabled = false; return toast('That code didn’t work. Check it and try again.'); }
    };
  }
}
actions.restart = () => viewSignIn('email');

async function redeemPendingInvite() {
  const code = localStorage.getItem('tv_invite');
  if (!code) return;
  const { data } = await sb.rpc('redeem_invite', { invite_code: code });
  localStorage.removeItem('tv_invite');
  if (!data) { // tell a newcomer why the link didn't work (used or expired)
    const { data: why } = await sb.rpc('invite_status', { invite_code: code });
    state.inviteProblem = why ?? null;
  }
  if (data) state.me = null; // reload: now a member
}

// ---------------------------------------------------------------- help
// How to save TV Rex like an app. Desktop steps differ from iPhone and iPad (Nov 20).
const SAVE_STEPS = {
  ios: 'In Safari, tap the Share button, then <b>Add to Home Screen</b>, then <b>Add</b>.',
  mac: 'Choose <b>File</b> › <b>Add to Dock</b> in the menu bar (or click the Share button, then <b>Add to Dock</b>), then click <b>Add</b>.',
  chrome: 'Click the three dots at the top right, then <b>Cast, save, and share</b> › <b>Install page as app</b>, then <b>Install</b>.',
};
// Which steps fit this device. iPads report themselves as Macs, so touch tells them apart.
function saveTip() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return `on iPhone or iPad, tap Share → Add to Home Screen to keep TV Rex one tap away.`;
  if (/Chrome\//.test(ua) && !/Edg\/|OPR\/|Mobile/.test(ua)) return `in Chrome, click the three dots at the top right, then Cast, save, and share › Install page as app, to keep TV Rex one click away.`;
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) return `in Safari, choose File › Add to Dock to keep TV Rex one click away.`;
  return `save TV Rex to your home screen or bookmarks to keep it one tap away. See Help for steps.`;
}
const HELP_EMAIL = ''; // shown as "Still stuck? Email …" when set
// Each group is for people signed out ('out'), signed in ('in'), or both. Tips are split per question.
const HELP = [
  ['Getting in', 'out', [
    ['How do I sign in?', 'Type your email and tap <b>Email me a code</b>. Open the email from TV Rex and type the code. On iPhone, the code often appears above the keyboard so you can tap it instead.'],
    ['How do I sign in with Face ID?', 'After you sign in with a code, TV Rex asks if you’d like to use Face ID. Tap <b>Yes</b>. Missed it? Once you’re in, go to <b>Me</b> and tap <b>Turn on</b> next to Sign in with Face ID. Next time, tap <b>Sign in with Face ID</b> and look at your phone.'],
    ['Why do I have to sign in again?', 'Safari forgets sign-ins for websites you haven’t opened in a week. Turn on Face ID and signing back in takes one look.'],
    ['I don’t have an invite', 'TV Rex is invite-only. If you know someone on it, ask them for a link, or <a href="#/request">request an invite</a> and we’ll email you one.'],
    ['My invite link says it’s used or expired', 'Some older invite links worked once, for one person, for 7 days. Ask the person who invited you to send their invite link again.'],
  ]],
  ['Using TV Rex', 'in', [
    ['How do I add something I watched?', 'Tap <b>Search</b> at the bottom. Type the name, tap the right show or movie, pick a rating, and add a note if you like.'],
    ['What do the ratings mean?', '<b>Loved</b> and <b>Liked</b> show up in everyone’s feed. <b>Didn’t like</b> and <b>Gave up</b> only show next to other people’s reviews of the same title, so they never start a new card.'],
    ['Where can I watch it?', 'Look for <b>Watch on</b> on each card. Services you’ve picked in <b>Me</b> are highlighted in blue. Streaming info is from JustWatch, for the US.'],
    ['How do I save something for later?', 'Tap <b>+ Want to watch</b>. It goes to <b>My list</b> at the bottom of the screen. Once you rate it, it moves to <b>My ratings</b> on the <b>Me</b> page.'],
    ['What does “Seen it” do?', 'It lets you rate a title right from the card, without opening it.'],
    ['How do I change or remove my review?', 'Open the show or movie and tap <b>Edit</b> next to your rating.'],
  ]],
  ['People', 'in', [
    ['How do I follow someone?', 'Tap their name on any review, then tap <b>+ Follow</b>.'],
    ['Everyone or Following?', '<b>Everyone</b> shows picks from everyone on TV Rex. <b>Following</b> shows only people you follow, plus your own.'],
    ['How do I invite someone?', 'Go to <b>Me</b>, open <b>Invites</b>, then tap <b>Send link</b>. Your link works for anyone, so you can send it to as many people as you like, or put it in a group chat.'],
    ['Who can see my picks?', 'Everyone who joined TV Rex by invite can see your name and reviews. Your email, your streaming services and My list stay private.'],
  ]],
  ['Tips', 'both', [
    ['How do I turn on Face ID?', 'Go to <b>Me</b> and tap <b>Turn on</b> next to Sign in with Face ID. Next time TV Rex asks you to sign in, tap <b>Sign in with Face ID</b> and look at your phone.', 'in'],
    ['How do I keep TV Rex one tap away?', `<b>iPhone or iPad:</b> ${SAVE_STEPS.ios}<br><br><b>Mac, in Safari:</b> ${SAVE_STEPS.mac}<br><br><b>Computer, in Chrome:</b> ${SAVE_STEPS.chrome}<br><br>Open TV Rex from the new icon and sign in once.`],
    ['How do I make the text bigger?', 'TV Rex keeps its text at one size on every iPhone and iPad, so the iPhone’s Text Size setting doesn’t change it. If you open TV Rex in Safari (not from the home-screen icon), you can tap <b>aA</b> in the address bar and tap the larger A.'],
  ]],
];
function helpFor(who) {
  return HELP.filter(([, g]) => g === who || g === 'both')
    .map(([group, , qs]) => [group, qs.filter(([, , only]) => !only || only === who)]);
}
function viewHelp() {
  $app.innerHTML = `
    <a href="${state.session ? 'javascript:history.back()' : '#/'}">← Back</a>
    <h1>Help</h1>
    ${helpFor(state.session ? 'in' : 'out').map(([group, qs], gi) => `<h2 class="help-group">${group}</h2>
      <div class="list faq">${qs.map(([q, a], qi) => `<details${!state.session && gi === 0 && qi === 0 ? ' open' : ''}><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`).join('')}
    ${HELP_EMAIL ? `<p class="muted">Still stuck? Email <a href="mailto:${HELP_EMAIL}">${HELP_EMAIL}</a>.</p>` : ''}`;
}

// ---------------------------------------------------------------- invite landing
// What someone sees when they open an invite link, before signing in (designed Nov 16).
// Who invited them comes from invite_preview (migration 015). Before that migration, or offline,
// the page still works, just without the inviter's name.
async function viewInvite() {
  const code = localStorage.getItem('tv_invite');
  const { data } = await sb.rpc('invite_preview', { invite_code: code });
  if (state.session || !localStorage.getItem('tv_invite')) return route(); // signed in meanwhile
  const inv = data ?? {};
  const name = inv.name;
  const dead = { used: 'This invite link has already been used.',
    expired: 'This invite link has expired.',
    invalid: 'This invite link doesn’t work.' }[inv.status];
  const icon = (paths) => `<span class="why-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
  const why = (svg, title, text) => `<div class="why">${icon(svg)}<div><h3>${title}</h3><p class="muted">${text}</p></div></div>`;
  $app.innerHTML = `
    <header class="hero">
      <img class="hero-logo" src="icon.png?v=5" alt="TV Rex">
      <h1>TV Rex</h1>
      <p>TV and movie recommendations by your friends and family</p>
    </header>
    ${dead ? `<div class="card invite-card">
        <h2>${dead}</h2>
        <p class="muted">Ask ${name ? esc(name) : 'the person who invited you'} for a new link, or request one.</p>
        <a class="btn primary big" href="#/request">Request an invite</a>
      </div>` : `<div class="card invite-card">
        <div class="inviter">${name ? avatar(inv.inviter_id, inv) : ''}<h2>${name ? `${esc(name)} invited you` : 'You’re invited to TV Rex'}</h2></div>
        <a class="btn primary big" href="#/signin">Join TV Rex</a>
      </div>`}
    <h2>What you get</h2>
    <div class="card whys">
      ${why('<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/>',
        'Picks from people you know', 'Loved it, liked it, or gave up. From friends and family, not critics.')}
      ${why('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 3l-4 4-4-4"/>',
        'Where to watch it', 'Every show and movie says which streaming services have it.')}
      ${why('<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6l1 1 2-2"/><path d="M4 12l1 1 2-2"/><path d="M4 18l1 1 2-2"/>',
        'Your own watch list', 'Save what you want to watch next and keep track of what you’ve seen.')}
    </div>
    <h2>A peek inside</h2>
    <div class="card peek">
      <div class="poster" aria-hidden="true"></div>
      <div class="peek-text">
        <h3>A show your friends watched</h3>
        <p class="muted">See who watched it, how they rated it, and what they said.</p>
        <div class="tally"><span class="rtag r-loved">${ratingIcon('loved')}3 Loved</span><span class="rtag r-liked">${ratingIcon('liked')}1 Liked</span><span class="rtag r-gave_up">${ratingIcon('gave_up')}1 Gave up</span></div>
      </div>
    </div>
    ${dead ? '' : `<a class="btn primary big" href="#/signin">Join TV Rex</a>`}
    <p class="muted center">Free. Nothing to download: it works in Safari on iPhone and iPad.</p>
    <div class="card privacy">${icon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>')}
      <p>Invite-only, just friends and family. People see your name and reviews. Your email and your list stay private.</p></div>
    <a class="help-link" href="#/signin">Already joined? Sign in</a>`;
}

// ---------------------------------------------------------------- not a member
// Signed in without an invite: the database shows them nothing, so say why.
function viewNotMember() {
  const why = { used: 'That invite link has already been used.',
    expired: 'That invite link has expired.',
    invalid: 'That invite link doesn’t work.' }[state.inviteProblem];
  $app.innerHTML = `${BRAND}
    <h2>TV Rex is invite-only</h2>
    ${why ? `<p><strong>${why}</strong></p>` : ''}
    <p>Ask the person who told you about TV Rex to send you a new invite link, then open it on this device.</p>
    <a class="btn primary big" href="#/request">Request an invite</a>
    <button class="big" data-act="signOut">Sign out</button>`;
}

// ---------------------------------------------------------------- request an invite
// Open to anyone. The database quietly drops repeats and floods, and the answer is always the same,
// so it never reveals whether an email already has an account.
function viewRequest() {
  const email = state.session?.user?.email ?? '';
  $app.innerHTML = `
    <a href="#/">← Back</a>
    <h1>Request an invite</h1>
    <p class="muted">TV Rex is just for friends and family. Tell us who you are, and we’ll email you an invite link.</p>
    <form id="rq" class="field" style="gap:16px">
      <div class="field"><label for="rqName">Your name</label><input id="rqName" autocomplete="name" maxlength="80" required></div>
      <div class="field"><label for="rqEmail">Your email</label><input id="rqEmail" type="email" autocomplete="email" maxlength="200" required value="${esc(email)}"></div>
      <div class="field"><label for="rqKnows">Who do you know on TV Rex?</label><input id="rqKnows" maxlength="200" required></div>
      <div class="hp" aria-hidden="true"><label for="rqWeb">Website</label><input id="rqWeb" tabindex="-1" autocomplete="off"></div>
      <button class="primary big" type="submit">Send request</button>
    </form>`;
  document.getElementById('rq').onsubmit = async (e) => {
    e.preventDefault();
    const val = (id) => document.getElementById(id).value.trim();
    const addr = val('rqEmail');
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    if (!val('rqWeb')) { // filled in only by bots
      const { error } = await sb.rpc('request_invite', { p_name: val('rqName'), p_email: addr, p_knows: val('rqKnows') });
      if (error) { btn.disabled = false; return toast('Couldn’t send. Check your connection and try again.'); }
    }
    $app.innerHTML = `${state.session ? '' : BRAND}
      <div class="card offer"><div class="offer-icon check" aria-hidden="true">✓</div>
        <h1>Request sent</h1>
        <p class="muted">If we know you, we’ll email an invite link to <b class="ink">${esc(addr)}</b>. Open it on this phone or iPad to join.</p></div>
      <a class="help-link" href="#/">${state.session ? '← Back' : '← Back to sign in'}</a>`;
  };
}

// ---------------------------------------------------------------- welcome

async function viewWelcome() {
  if (!state.services) state.services = (await fn('services')).services;
  $app.innerHTML = `
    <h1>Welcome to TV Rex</h1>
    <p class="muted">You’ll see picks from everyone on TV Rex, and they’ll see yours.</p>
    <div class="field"><label for="name">Your name, as others see it</label>
      <input id="name" value="${esc(state.me.name)}" autocomplete="given-name" placeholder="First name">
      <p class="muted small" id="nameError" role="alert"></p></div>
    <h2>Which streaming services do you have?</h2>
    <div class="row" id="svc">${serviceChips('toggleSvc')}</div>
    <button class="primary big" data-act="finishWelcome">Done</button>
    <p class="muted">Tip: ${saveTip()}</p>`;
}
function serviceChips(act) {
  return state.services.map((s) => {
    const on = s.ids.some((i) => myServices().includes(i));
    return `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-ids="${s.ids.join(',')}" aria-pressed="${on}">${esc(s.name)}</button>`;
  }).join('');
}
const chosenServiceIds = () => [...document.querySelectorAll('#svc .chip.on')].flatMap((b) => b.dataset.ids.split(',').map(Number));
actions.toggleSvc = (d, el) => { el.classList.toggle('on'); el.setAttribute('aria-pressed', el.classList.contains('on')); };
actions.finishWelcome = async () => {
  const name = document.getElementById('name').value.trim() || state.me.name;
  if (!name) { document.getElementById('nameError').textContent = 'Enter the name people will see.'; document.getElementById('name').focus(); return; }
  const services = chosenServiceIds();
  await sb.from('profiles').update({ name, services, onboarded: true }).eq('id', state.me.id);
  Object.assign(state.me, { name, services, onboarded: true });
  location.hash = '#/add';
  toast('All set. Add a show you loved.');
};

// ---------------------------------------------------------------- feed

// The feed shows the last copy saved on this device right away, then fetches fresh data and redraws.
// Saved per person, so a shared iPad never shows someone else's feed.
const feedKey = () => `tv_feed_${state.me?.id}`;
async function fetchFeed() {
  const [{ data: rows, error }, { data: wl }] = await Promise.all([
    sb.from('ratings')
      .select('user_id, title_id, rating, note, season, source, activity_at, titles(*)')
      .order('activity_at', { ascending: false }).limit(400),
    sb.from('watchlist').select('title_id').is('watched_at', null),
  ]);
  if (error) throw error;
  return { rows: rows ?? [], wl: wl ?? [] };
}
async function viewFeed() {
  const cached = storeGet(feedKey());
  if (cached) {
    await renderFeed(cached);
    fetchFeed().then(async (fresh) => {
      storeSet(feedKey(), fresh);
      // Redraw only if something changed and you're still on the feed, not mid-rating or in the filter sheet.
      if (JSON.stringify(fresh) === JSON.stringify(cached)) return;
      const page = location.hash.replace(/^#\/?/, '').split('/')[0];
      if ((page && page !== 'feed') || document.querySelector('#rate') || document.body.classList.contains('sheet-open')) return;
      await renderFeed(fresh);
      markLongNotes();
    }).catch((e) => console.error(e));
    return;
  }
  const fresh = await fetchFeed();
  storeSet(feedKey(), fresh);
  await renderFeed(fresh);
}
const FEED_PAGE = 20; // titles per batch; Show more adds another batch
async function renderFeed({ rows, wl }) {
  state.feedLast = { rows, wl };
  const limit = state.feedLimit ?? FEED_PAGE;

  // Old quick-pick ratings without a note (from the retired quick-pick cards) stay out of the feed.
  const isQuiet = (r) => r.source === 'quickpick' && !r.note;

  // Following: only reviews by people you follow (and your own).
  const following = state.feedPeople === 'following';
  const inView = (r) => !following || isMe(r.user_id) || state.following.has(r.user_id);

  // One card per title, started by someone's Loved or Liked.
  const cards = new Map();
  for (const r of rows ?? []) {
    if (isQuiet(r) || !inView(r)) continue;
    if (!cards.has(r.title_id)) cards.set(r.title_id, { title: r.titles, reviews: [], started: false });
    const c = cards.get(r.title_id);
    c.reviews.push(r);
    if (POSITIVE.includes(r.rating)) c.started = true;
  }
  let list = [...cards.values()].filter((c) => c.started);
  if (state.feedType !== 'all') list = list.filter((c) => c.title.media_type === state.feedType);
  if (state.feedGenre !== 'all') { await fillGenres(list.map((c) => c.title)); list = list.filter((c) => inGenre(c.title, state.feedGenre)); }
  else fillGenres(list.slice(0, 40).map((c) => c.title)); // quietly, so the Genre filter is ready later
  await loadProviders(list.map((c) => c.title.id));
  // Only titles you can stream right now (if streaming info didn't load, keep the card).
  list = list.filter((c) => !state.providers.has(c.title.id) || subs(c.title.id).length);
  if (state.feedSvc === 'mine') list = list.filter((c) => onMyServices(c.title.id));
  if (state.feedSort === 'release') list.sort((a, b) => (b.title.year ?? 0) - (a.title.year ?? 0)); // same year keeps review order

  const saved = new Set(wl.map((w) => w.title_id));

  $app.innerHTML = `
    ${BRAND}
    <div class="tabs" role="tablist" aria-label="Whose picks">
      ${[['all', 'Everyone'], ['following', 'Following']].map(([v, l]) => `<button role="tab" class="${state.feedPeople === v ? 'on' : ''}" aria-selected="${state.feedPeople === v}" data-act="feedPeople" data-val="${v}">${l}</button>`).join('')}</div>
    ${filterBar('feed')}
    ${list.length ? list.slice(0, limit).map((c) => feedCard(c, saved)).join('') + (list.length > limit
      ? `<button class="big" data-act="feedMore">Show more · ${list.length - limit} left</button><p class="muted" style="text-align:center;margin:0">Showing ${limit} of ${list.length} titles</p>` : '')
      : following && !state.following.size ? '<p class="empty">You’re not following anyone yet. In Everyone, tap a name on a review, then tap Follow.</p>'
      : `<p class="empty">No picks yet. ${state.people.size <= 1 ? 'Once others join, their picks show up here.' : 'Rate something to get things going.'}</p>`}`;
}
actions.feedPeople = (d) => { state.feedPeople = d.val; state.feedLimit = FEED_PAGE; route(); };
actions.feedMore = async () => {
  const y = window.scrollY;
  state.feedLimit = (state.feedLimit ?? FEED_PAGE) + FEED_PAGE;
  await renderFeed(state.feedLast);
  markLongNotes();
  window.scrollTo(0, y);
};

// Filters: one "Showing … / Filter" line; the choices slide up in a panel.
const TYPE = ['Show', [['all', 'All'], ['tv', 'TV'], ['movie', 'Movies']]];
// Genre filter: TMDB's TV and movie genres folded into a short, plain list.
const GENRES = [
  ['comedy', 'Comedy', [35]],
  ['drama', 'Drama', [18]],
  ['crime', 'Crime & mystery', [80, 9648]],
  ['thriller', 'Thriller & horror', [53, 27]],
  ['action', 'Action & adventure', [28, 12, 10759, 37, 10752, 10768]],
  ['scifi', 'Sci-fi & fantasy', [878, 14, 10765]],
  ['romance', 'Romance', [10749]],
  ['docs', 'Documentary & history', [99, 36]],
  ['family', 'Family & animation', [10751, 16, 10762]],
  ['reality', 'Reality & talk', [10764, 10767, 10402]],
];
const GENRE_OPTS = [['all', 'Any genre'], ...GENRES.map(([k, l]) => [k, l])];
const inGenre = (t, key) => key === 'all' || (t?.genres ?? []).some((g) => GENRES.find(([k]) => k === key)[2].includes(g));
// Titles saved before genres were stored get them filled in, a batch at a time.
async function fillGenres(titles) {
  const missing = [...new Map(titles.filter((t) => t && t.genres == null).map((t) => [t.id, t])).values()].slice(0, 40);
  if (!missing.length) return;
  try {
    const { genres } = await fn('genres', { ids: missing.map((t) => t.id) });
    for (const t of titles) if (t && t.genres == null && genres[t.id]) t.genres = genres[t.id];
  } catch (e) { console.error('genres', e); }
}
const FILTERS = {
  feed: [['feedType', ...TYPE], ['feedGenre', 'Genre', GENRE_OPTS], ['feedSvc', 'Services', [['all', 'All services'], ['mine', 'My services']]],
    ['feedSort', 'Sort by', [['review', 'Latest reviews'], ['release', 'Newest releases']]]],
  list: [['listSvc', 'Services', [['all', 'All services'], ['mine', 'On my services']]], ['listType', ...TYPE], ['listGenre', 'Genre', GENRE_OPTS],
    ['listSort', 'Sort by', [['added', 'Recently saved'], ['release', 'Newest releases']]]],
};
const FILTER_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M7 12h10M10 17h4"/></svg>';
function filterBar(name) {
  const groups = FILTERS[name];
  // The first option in each group is the default; anything else is listed in the "Showing" line.
  const active = groups.filter(([key, , opts]) => state[key] !== opts[0][0]).map(([key, , opts]) => opts.find(([v]) => v === state[key])[1]);
  return `<div class="filterbar"><span class="muted">Showing: <strong>${active.length ? active.join(' · ') : 'Everything'}</strong></span>
      <button class="${active.length ? 'on' : ''}" data-act="openFilters" aria-haspopup="dialog">${FILTER_ICON} Filter &amp; sort</button></div>
    <div class="sheet-backdrop" data-act="closeFilters"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle" tabindex="-1">
      <h2 id="sheetTitle">Filter and sort</h2>
      ${groups.map(([key, label, opts]) => `<div class="field"><label>${label}</label><div class="${opts.length > 4 ? 'row chips' : 'seg'}" role="group" aria-label="${label}">
        ${opts.map(([v, l]) => `<button class="${opts.length > 4 ? 'chip ' : ''}${state[key] === v ? 'on' : ''}" data-act="pickFilter" data-key="${key}" data-val="${v}" aria-pressed="${state[key] === v}">${l}</button>`).join('')}</div></div>`).join('')}
      <button class="primary big" data-act="closeFilters">Done</button>
    </div>`;
}
let filtersChanged = false;
actions.openFilters = () => { document.body.classList.add('sheet-open'); document.querySelector('.sheet')?.focus(); };
actions.pickFilter = (d, el) => {
  state[d.key] = d.val; filtersChanged = true; state.feedLimit = FEED_PAGE; // new filter: start the feed over
  el.parentElement.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === el); b.setAttribute('aria-pressed', b === el); });
};
actions.closeFilters = () => {
  document.body.classList.remove('sheet-open');
  if (filtersChanged) { filtersChanged = false; route(); }
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('sheet-open')) actions.closeFilters(); });

function feedCard(c, saved) {
  const t = c.title, mine = c.reviews.find((r) => isMe(r.user_id));
  const shown = c.reviews.slice(0, 2);
  if (mine && !shown.includes(mine)) shown.push(mine); // your own review always shows, with its Edit link
  const more = c.reviews.length - shown.length;
  return `<article class="card pick-card">
    <div class="pick">
      <a href="${titleLink(t)}">${poster(t.poster_path)}</a>
      <div class="pick-body">
        <a class="title" href="${titleLink(t)}">${esc(t.name)}</a>
        <span class="muted">${kind(t)}</span>
        ${watchOn(t.id)}
        ${tally(c.reviews)}
      </div>
    </div>
      ${shown.map((r) => reviewHtml(r)).join('')}
      ${more > 0 ? `<a class="small more" href="${titleLink(t)}">See all ${c.reviews.length} reviews ›</a>` : ''}
      ${mine ? '' : `<div class="row actions">
        ${saved.has(t.id) ? SAVED : `<button class="primary" data-act="save" data-id="${esc(t.id)}">+ Want to watch</button>`}
        <button data-act="seenIt" data-id="${esc(t.id)}">Seen it</button>
      </div>`}
    </article>`;
}

function reviewHtml(r) {
  return `<div class="review">${avatar(r.user_id)}<div class="review-body">
    <div class="who">${personLink(r.user_id)} ${ratingTag(r)}
      ${isMe(r.user_id) ? `<a class="small edit" href="#/title/${encodeURIComponent(r.title_id)}">Edit</a>` : ''}
      <span class="when">${when(r.activity_at)}</span></div>
    ${r.note ? `<div class="note clamp">${esc(r.note)}</div><button class="link small readmore" data-act="readMore" hidden>Read more</button>` : ''}</div></div>`;
}
// Long notes show 3 lines; Read more appears only when a note is actually cut off.
function markLongNotes() {
  for (const n of document.querySelectorAll('.note.clamp')) {
    const line = parseFloat(getComputedStyle(n).lineHeight) || 26;
    if (n.scrollHeight > line * 3.5) n.nextElementSibling.hidden = false; // more than 3 lines
  }
}
actions.readMore = (d, el) => { el.previousElementSibling.classList.remove('clamp'); el.remove(); };

actions.seenIt = (d, el) => {
  const box = el.closest('.actions');
  box.outerHTML = `<div class="field" style="margin-top:6px;width:100%">${ratingForm(null, d.id).replace('<form ', `<form data-after="${esc(location.hash || '#/feed')}" `)}
    <button class="link" type="button" data-act="cancelSeen">Cancel</button></div>`;
};
actions.cancelSeen = () => route();
actions.save = async (d, el) => {
  el.disabled = true;
  const { data: rs } = await sb.from('ratings').select('user_id, rating').eq('title_id', d.id);
  const recs = (rs ?? []).filter((r) => !isMe(r.user_id) && POSITIVE.includes(r.rating)).map((r) => r.user_id);
  const { error: wErr } = await sb.from('watchlist').upsert({ user_id: state.me.id, title_id: d.id, watched_at: null });
  if (wErr) { el.disabled = false; throw wErr; }
  if (recs.length) await sb.from('watchlist_credits').upsert(recs.map((rid) => ({ user_id: state.me.id, title_id: d.id, recommender_id: rid })), { ignoreDuplicates: true });
  el.outerHTML = SAVED;
  toast('Saved to your list');
  window.gtag?.('event', 'want_to_watch', { method: 'app', title_id: d.id });
};

// ---------------------------------------------------------------- title page

async function viewTitle(id, act) {
  // From the Sunday email's Want to watch button: save it (crediting friends who loved or liked it), then show the page.
  if (act === 'save') {
    history.replaceState(null, '', `#/title/${encodeURIComponent(id)}`);
    const [{ data: rated }, { data: rs }] = await Promise.all([
      sb.from('ratings').select('title_id').eq('user_id', state.me.id).eq('title_id', id).maybeSingle(),
      sb.from('ratings').select('user_id, rating').eq('title_id', id),
    ]);
    if (!rated) {
      const { error } = await sb.from('watchlist').upsert({ user_id: state.me.id, title_id: id, watched_at: null }, { onConflict: 'user_id,title_id', ignoreDuplicates: true });
      const recs = (rs ?? []).filter((r) => !isMe(r.user_id) && POSITIVE.includes(r.rating)).map((r) => r.user_id);
      if (!error && recs.length) await sb.from('watchlist_credits').upsert(recs.map((rid) => ({ user_id: state.me.id, title_id: id, recommender_id: rid })), { ignoreDuplicates: true });
      if (!error) {
        toast('Saved to your list');
        window.gtag?.('event', 'want_to_watch', { method: 'email', title_id: id }); // Google Analytics: saves from the Sunday email
      }
    }
  }
  const [{ data: t }, { data: rs }, { data: wl }] = await Promise.all([
    sb.from('titles').select('*').eq('id', id).single(),
    sb.from('ratings').select('user_id, title_id, rating, note, season, activity_at').eq('title_id', id).order('activity_at', { ascending: false }),
    sb.from('watchlist').select('*').eq('title_id', id).maybeSingle(),
  ]);
  if (!t) { $app.innerHTML = '<p class="empty">Title not found.</p>'; return; }
  const onList = wl && !wl.watched_at;
  const listButtons = onList && wl.started_at ? WATCHING
    : `${onList ? SAVED : `<button data-act="save" data-id="${esc(id)}">+ Want to watch</button>`}
       <button data-act="watchNow" data-id="${esc(id)}">Watching</button>`;
  await loadProviders([id]);
  const p = state.providers.get(id) ?? {};
  const mine = (rs ?? []).find((r) => isMe(r.user_id));
  const others = (rs ?? []).filter((r) => !isMe(r.user_id));
  $app.innerHTML = `
    <a href="javascript:history.back()">← Back</a>
    <div class="pick">${poster(t.poster_path, 'lg')}
      <div class="pick-body"><h1>${esc(t.name)}</h1><span class="muted" id="facts1">${kind(t)}</span>
        <span class="muted" id="facts2"></span><span id="trailer"></span>
      </div></div>
    <div id="about"></div>
    ${mine ? '' : `<button class="primary big" id="writeReview" data-act="openReview">Write review</button>
      <div id="newReview" hidden>${ratingForm(null, id)}</div>
      <div class="row actions">${listButtons}</div>
      ${onList ? `<button class="link small remove" data-act="removeFromList" data-id="${esc(id)}" data-name="${esc(t.name)}">Remove from list</button>` : ''}`}
    <section class="card watchbox">
      <div class="muted small">WATCH ON</div>
      ${subs(id).length ? `<div class="row">${subs(id).map((s) => `<span class="chip ${isMine(s) ? 'on' : ''}" style="display:inline-flex;align-items:center">${esc(s.name)}</span>`).join('')}</div>` : '<p>Not on a subscription service in the US right now.</p>'}
      ${p.rent?.length || p.buy?.length ? `<p class="muted">Rent or buy: ${esc([...new Set([...(p.rent ?? []), ...(p.buy ?? [])].map((s) => serviceName(s.name)))].slice(0, 4).join(', '))}</p>` : ''}
      <p class="credits">Streaming data from JustWatch</p>
    </section>
    ${mine ? `<h2>Your rating</h2>
      <div class="card" id="myReview">
        <div class="spread"><span>${ratingTag(mine)} <span class="muted">· ${when(mine.activity_at)}</span></span>
          <button class="link" data-act="editReview">Edit review</button></div>
        ${mine.note ? `<div class="note">${esc(mine.note)}</div>` : '<p class="muted">No note.</p>'}
      </div>
      <div id="reviewForm" hidden>
        ${ratingForm(mine, id, 'Save changes')}
        <div class="row"><button class="link" data-act="cancelEdit">Cancel</button>
          <button class="link danger" data-act="removeRating" data-id="${esc(id)}">Remove my rating</button></div>
      </div>` : ''}
    <h2>Reviews</h2>
    ${tally(rs ?? [])}
    ${others.length ? `<div class="list">${others.map((r) => reviewHtml(r)).join('')}</div>` : '<p class="muted">No one else has rated this yet.</p>'}`;
  fillDetails(t); // description, cast and trailer arrive a moment after the page draws
}
// TMDB extras for a show page: "2022 · Drama, Crime · TV-MA", "5 seasons · Still running", description, cast, trailer.
const detailsCache = new Map();
const STATUS = { 'Returning Series': 'Still running', 'In Production': 'Still running', Ended: 'Ended', Canceled: 'Canceled', Planned: 'Coming soon' };
async function fillDetails(t) {
  let d = detailsCache.get(t.id);
  if (!d) {
    try { d = await fn('details', { id: t.id }); } catch { return; }
    detailsCache.set(t.id, d);
  }
  const f1 = document.getElementById('facts1');
  if (!f1 || !location.hash.includes(encodeURIComponent(t.id))) return; // moved on to another page
  f1.textContent = [t.year, d.genres.join(', '), d.rating].filter(Boolean).join(' · ') || kind(t);
  const runtime = d.runtime ? (d.runtime >= 60 ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m` : `${d.runtime}m`) : '';
  document.getElementById('facts2').textContent = t.media_type === 'tv'
    ? [d.seasons ? `${d.seasons} season${d.seasons === 1 ? '' : 's'}` : '', STATUS[d.status] ?? ''].filter(Boolean).join(' · ')
    : runtime;
  if (d.trailer) document.getElementById('trailer').innerHTML = `<a class="trailer" href="${esc(d.trailer)}" target="_blank" rel="noopener">
    <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z"/></svg>Watch trailer</a>`;
  document.getElementById('about').innerHTML = (d.overview ? `<div class="note clamp">${esc(d.overview)}</div><button class="link small readmore" data-act="readMore" hidden>Read more</button>` : '')
    + (d.cast.length ? `<p class="cast"><span class="muted">Starring</span> ${esc(d.cast.join(', '))}</p>` : '');
  markLongNotes();
}

function ratingForm(mine, titleId, saveLabel = 'Save review') {
  return `<form class="field" data-title="${esc(titleId)}" id="rate">
    <div class="ratings">${Object.entries(RATING).map(([k, v]) =>
      `<button type="button" class="${mine?.rating === k ? 'on' : ''}" data-act="pickRating" data-val="${k}" aria-pressed="${mine?.rating === k}">${ratingIcon(k)}${v}</button>`).join('')}</div>
    ${titleId.startsWith('tv:') ? `<label for="season">How far did you get?</label>
    <select id="season" class="season" data-title="${esc(titleId)}" data-current="${mine?.season ?? ''}"><option value="">Whole show</option></select>` : ''}
    <label for="note">Note (optional)</label>
    <textarea id="note" maxlength="5000" rows="3" placeholder="What should friends know?">${esc(mine?.note)}</textarea>
    <p class="muted">Loved and Liked put this in everyone’s feed. You can change your rating anytime.</p>
    <button class="primary big" type="button" data-act="saveRating">${saveLabel}</button></form>`;
}
actions.openReview = () => {
  document.getElementById('writeReview').hidden = true;
  const box = document.getElementById('newReview');
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
actions.editReview = () => {
  document.getElementById('myReview').hidden = true;
  document.getElementById('reviewForm').hidden = false;
};
actions.cancelEdit = () => {
  document.getElementById('myReview').hidden = false;
  document.getElementById('reviewForm').hidden = true;
};
actions.removeRating = async (d) => {
  if (!confirm('Remove your rating for this title?')) return;
  await sb.from('ratings').delete().eq('user_id', state.me.id).eq('title_id', d.id);
  toast('Rating removed');
  route();
};
actions.pickRating = (d, el) => {
  el.parentElement.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === el); b.setAttribute('aria-pressed', b === el); });
};
actions.saveRating = async (d, el) => {
  const form = el.closest('form');
  const rating = form.querySelector('.ratings .on')?.dataset.val;
  if (!rating) return toast('Pick a rating first');
  el.disabled = true;
  const titleId = form.dataset.title;
  const note = form.querySelector('#note').value.trim() || null;
  const seasonVal = form.querySelector('#season')?.value;
  const season = seasonVal ? Number(seasonVal) : null;
  const row = { user_id: state.me.id, title_id: titleId, rating, note, season, source: form.dataset.source || 'search' };
  const { error } = await sb.from('ratings').upsert(row);
  if (error) { el.disabled = false; throw error; }
  await sb.from('watchlist').update({ watched_at: new Date().toISOString() }).eq('title_id', titleId).is('watched_at', null);
  toast(form.dataset.source === 'watchlist' ? 'Saved to My ratings' : 'Saved');
  if (form.dataset.after && form.dataset.after !== location.hash) location.hash = form.dataset.after; else route();
};

// ---------------------------------------------------------------- add

let searchTimer;
const searchCache = new Map();
// Straight to Watching: on My list and already started.
actions.watchNow = async (d, el) => {
  el.disabled = true;
  if (!(await ensureTitle(d.id))) { el.disabled = false; return toast('Couldn’t load that title. Try again.'); }
  const { data: rs } = await sb.from('ratings').select('user_id, rating').eq('title_id', d.id);
  const recs = (rs ?? []).filter((r) => !isMe(r.user_id) && POSITIVE.includes(r.rating)).map((r) => r.user_id);
  const { error } = await sb.from('watchlist').upsert({ user_id: state.me.id, title_id: d.id, watched_at: null, started_at: new Date().toISOString() });
  if (error) { el.disabled = false; throw error; }
  if (recs.length) await sb.from('watchlist_credits').upsert(recs.map((rid) => ({ user_id: state.me.id, title_id: d.id, recommender_id: rid })), { ignoreDuplicates: true });
  toast('Added to Watching');
  location.hash = '#/list';
};
async function ensureTitle(id) {
  const { data } = await sb.from('titles').select('*').eq('id', id).maybeSingle();
  if (data) return data;
  const t = searchCache.get(id);
  if (!t) return null;
  await sb.from('titles').insert(t);
  return t;
}
// One row of the Search page's "What you can do here" card.
const introRow = (paths, head, detail) => `<div class="intro-row">
  <span class="intro-icon"><svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>
  <span><strong>${head}</strong><br><span class="muted">${detail}</span></span></div>`;
async function viewAdd() {
  $app.innerHTML = `
    <h1>Search</h1>
    <div class="field"><label for="q">Search any show or movie</label>
      <div class="search-wrap"><input id="q" type="search" autocomplete="off" placeholder="e.g. Slow Horses">
        <button type="button" class="search-clear" id="qClear" aria-label="Clear search" hidden><svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div>
    <div id="intro">
      <p class="muted intro-head">What you can do here</p>
      <div class="list intro">
        ${introRow('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', 'Recommend it', 'Rate a show or movie you watched so friends see it.')}
        ${introRow('<path d="M6 3h12v18l-6-4-6 4z"/><path d="M12 7v6M9 10h6"/>', 'Save it', 'Add it to Want to Watch or Watching.')}
        ${introRow('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.3 0 4 1.3 4.6 4"/>', 'Look it up', 'See what friends thought of it.')}
      </div>
    </div>
    <div id="results"></div>`;
  const q = document.getElementById('q');
  q.focus();
  const clear = document.getElementById('qClear');
  // Clears the box and the remembered search, so the explainer comes back (Nov 20).
  clear.onclick = () => { q.value = ''; q.oninput(); q.focus(); };
  q.oninput = () => {
    state.searchQ = q.value;
    clear.hidden = !q.value;
    // The explainer is for an empty box; it steps aside once you start searching.
    document.getElementById('intro').hidden = q.value.trim().length >= 2;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const asked = q.value;
      const box = document.getElementById('results');
      if (q.value.trim().length < 2) { box.innerHTML = ''; return; }
      const { results } = await fn('search', { q: q.value });
      for (const t of results) searchCache.set(t.id, t);
      if (q.value !== asked) return; // typing moved on
      box.innerHTML = results.length ? `<div class="list">${results.map((t) =>
        `<a class="item" href="#/title/${encodeURIComponent(t.id)}" data-act="chooseTitle" data-id="${esc(t.id)}">
          <span class="row">${poster(t.poster_path, 'sm')}<span><strong>${esc(t.name)}</strong><br><span class="muted">${kind(t)}</span><span class="who-rated" data-id="${esc(t.id)}"></span></span></span><span class="muted">›</span></a>`).join('')}</div>`
        : '<p class="muted">No matches. Try another spelling.</p>';
      fillWhoRated(results.map((t) => t.id)); // results show right away; names fill in a moment later
    }, 300);
  };
  if (state.backToSearch && state.searchQ) { q.value = state.searchQ; q.oninput(); } // back from a show's page: same results
  state.backToSearch = false;
}
// "Brian loved it · Maggie liked it · +2 more" under each search result. You first, then newest.
async function fillWhoRated(ids) {
  if (!ids.length) return;
  const { data } = await sb.from('ratings').select('user_id, title_id, rating').in('title_id', ids).order('activity_at', { ascending: false });
  const verb = { loved: 'loved it', liked: 'liked it', didnt_like: 'didn’t like it', gave_up: 'gave up' };
  for (const el of document.querySelectorAll('.who-rated')) {
    const rs = (data ?? []).filter((r) => r.title_id === el.dataset.id).sort((a, b) => isMe(b.user_id) - isMe(a.user_id));
    if (!rs.length) continue;
    const named = rs.slice(0, 2).map((r) => `${esc(nameOf(r.user_id))} ${verb[r.rating]}`);
    el.innerHTML = `<br>${named.join(' · ')}${rs.length > 2 ? ` · +${rs.length - 2} more` : ''}`;
  }
}
// A search result opens the show's page: where to watch, friends' reviews, and Write review (Nov 18).
actions.chooseTitle = async (d) => {
  const t = await ensureTitle(d.id);
  if (!t) return toast('Couldn’t load that title. Try again.');
  state.backToSearch = true;
  location.hash = `#/title/${encodeURIComponent(d.id)}`;
};

// ---------------------------------------------------------------- want to watch

// My list: what's ahead (Watching, Want to watch), all private to you. What you've rated lives in
// My ratings on Me (Nov 20); a row at the bottom links there.
async function viewList() {
  const cols = 'title_id, added_at, titles(*), watchlist_credits(recommender_id)';
  const { data: rows } = await sb.from('watchlist').select(cols + ', started_at')
    .is('watched_at', null).order('added_at', { ascending: false });
  const { count: nWatched } = await sb.from('ratings')
    .select('title_id', { count: 'exact', head: true }).eq('user_id', state.me.id);
  let items = rows ?? [];
  await loadProviders(items.map((r) => r.title_id));
  if (state.listType !== 'all') items = items.filter((r) => r.titles.media_type === state.listType);
  if (state.listGenre !== 'all') { await fillGenres(items.map((r) => r.titles)); items = items.filter((r) => inGenre(r.titles, state.listGenre)); }
  if (state.listSvc === 'mine') items = items.filter((r) => onMyServices(r.title_id));
  if (state.listSort === 'release') items.sort((a, b) => (b.titles.year ?? 0) - (a.titles.year ?? 0));
  const watching = items.filter((r) => r.started_at).sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  const want = items.filter((r) => !r.started_at);
  const head = (label, n, extra = '') => `<div class="spread shelf-head"><h2>${label} <span class="muted">${n}</span></h2>${extra}</div>`;
  const card = (r, buttons, line) => `<div class="card pick-card"><div class="pick">
      <a href="${titleLink(r.titles)}">${poster(r.titles.poster_path, 'sm')}</a>
      <div class="pick-body"><a class="title" href="${titleLink(r.titles)}">${esc(r.titles.name)}</a>
        <span class="muted">${line}</span>${watchOn(r.title_id)}</div></div>
      <div class="row actions">${buttons}</div>
      <button class="link small remove" data-act="removeFromList" data-id="${esc(r.title_id)}" data-name="${esc(r.titles.name)}">Remove from list</button></div>`;
  const from = (r) => {
    const f = r.watchlist_credits.map((c) => personLink(c.recommender_id));
    return f.length ? 'from ' + f.join(', ') : 'added by you';
  };
  const filtered = (rows ?? []).length > items.length;
  $app.innerHTML = `
    <h1>My list</h1>
    ${filterBar('list')}
    ${head('Watching', watching.length)}
    ${watching.length ? watching.map((r) => card(r,
      `<button class="primary" data-act="watched" data-id="${esc(r.title_id)}">Write review</button>
       <button data-act="stopWatching" data-id="${esc(r.title_id)}">Not watching</button>`,
      `${kind(r.titles)} · started ${when(r.started_at)}`)).join('')
      : `<p class="muted">${filtered ? 'Nothing here with these filters.' : 'Tap <b>Watching</b> on anything below.'}</p>`}
    ${head('Want to watch', want.length)}
    ${want.length ? want.map((r) => card(r,
      `<button class="primary" data-act="startWatching" data-id="${esc(r.title_id)}">Watching</button>
       <button data-act="watched" data-id="${esc(r.title_id)}">Write review</button>`,
      from(r))).join('')
      : `<p class="muted">${filtered ? 'Nothing here with these filters. Try “All”.' : 'Nothing saved yet. Tap “+ Want to watch” on a friend’s pick.'}</p>`}
    ${nWatched ? `<div class="list" style="margin-top:24px"><a class="item" href="#/friend/${state.me.id}"><span>Watched</span><span class="muted">${nWatched} ›</span></a></div>
      <p class="muted small">Once you rate something, it moves to My ratings on the Me page.</p>` : ''}`;
}
actions.startWatching = async (d) => {
  const { error } = await sb.from('watchlist').update({ started_at: new Date().toISOString() }).eq('user_id', state.me.id).eq('title_id', d.id);
  if (error) throw error;
  route();
};
actions.stopWatching = async (d) => {
  const { error } = await sb.from('watchlist').update({ started_at: null }).eq('user_id', state.me.id).eq('title_id', d.id);
  if (error) throw error;
  toast('Moved back to Want to watch');
  route();
};
// Takes a title off Watching or Want to watch entirely (Not watching only moves it back to Want to watch).
actions.removeFromList = async (d) => {
  if (!confirm(`Remove ${d.name} from your list?`)) return;
  const { error } = await sb.from('watchlist').delete().eq('user_id', state.me.id).eq('title_id', d.id);
  if (error) throw error;
  toast('Removed from your list');
  route();
};
actions.watched = async (d) => {
  const { data: t } = await sb.from('titles').select('*').eq('id', d.id).single();
  $app.innerHTML = `
    <a href="#/list">← Back</a>
    <div class="pick">${poster(t.poster_path, 'lg')}<div class="pick-body"><h1>How was ${esc(t.name)}?</h1></div></div>
    ${ratingForm(null, d.id).replace('<form ', '<form data-after="#/list" data-source="watchlist" ')}`;
};

// ---------------------------------------------------------------- me

// Me: draws at once from what's already loaded, then fills in counts as they arrive. Each section is a
// collapsed row (like Google Home's account sheet, Nov 18); tap to open.
const ICON = (d) => `<svg class="me-ic" aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ME_ICONS = {
  profile: ICON('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  picks: ICON('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  services: ICON('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  invite: ICON('<circle cx="9" cy="8" r="4"/><path d="M2 21c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5M19 8v6M16 11h6"/>'),
  following: ICON('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.3 3.4-5 6.5-5s5.5 1.7 6.5 5"/><circle cx="17" cy="9" r="2.8"/><path d="M17.5 14.5c2.2.3 3.6 1.9 4.2 4.5"/>'),
  face: ICON('<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 15.5c1.5 1.2 3.5 1.2 5 0"/>'),
  email: ICON('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  help: ICON('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4M12 17h.01"/>'),
  about: ICON('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
  requests: ICON('<path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h5l1 2h4l1-2h5"/>'),
  feedback: ICON('<path d="M4 5h16v11H9l-5 4z"/><path d="M12 8v3M12 13.5h.01"/>'),
};
const meRow = (id, icon, label, body, extra = '') => `<details id="${id}"${extra}><summary>${ME_ICONS[icon]}<span class="me-label">${label}</span><span class="muted me-sum" id="${id}Sum"></span></summary><div class="me-body" id="${id}Body">${body}</div></details>`;
let meDraw = 0;
async function viewMe() {
  const draw = ++meDraw;
  const live = () => draw === meDraw && document.getElementById('meRoot');
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  $app.innerHTML = `<div id="meRoot" class="me">
    <div class="me-head">${avatar(state.me.id).replace('class="avatar"', 'class="avatar lg" id="myAvatar"')}
      <div><h1>${esc(state.me.name)}</h1><span class="muted" id="meCount">&nbsp;</span>${state.me.is_host ? '<span class="muted" id="meMembers"></span>' : ''}</div></div>
    <div class="list me-list" id="meAdmin" hidden></div>
    <div class="list me-list">
      ${meRow('meProfile', 'profile', 'Name and photo', `
        <div class="field"><label for="myName">Your name, as others see it</label>
          <div class="row" style="flex-wrap:nowrap"><input id="myName" style="flex:1;min-width:0" value="${esc(state.me.name)}" autocomplete="given-name">
          <button class="primary" data-act="saveName">Save</button></div></div>
        <div class="row photo-actions">
          <label class="btn small-btn" for="photoInput">${state.me.avatar_url ? 'Change photo' : 'Add photo'}</label>
          <input type="file" id="photoInput" accept="image/*" hidden>
          ${state.me.avatar_url ? '<button class="link small" data-act="removePhoto">Remove photo</button>' : ''}
        </div>`)}
      <a class="item me-link" href="#/friend/${state.me.id}">${ME_ICONS.picks}<span class="me-label">My ratings</span><span class="muted me-sum" id="mePicksSum"></span><span class="muted">›</span></a>
      ${meRow('meSvc', 'services', 'My services', `<p class="muted">Used for the My services filter and highlights.</p><div class="row" id="svc">${state.services ? serviceChips('toggleMySvc') : '<span class="muted">Loading…</span>'}</div>`)}
      ${meRow('meInv', 'invite', 'Invites', `<div id="inviteBox"></div><div id="meInvLink"></div>`, ' hidden')}
      <a class="item me-link" href="#/following">${ME_ICONS.following}<span class="me-label">Following</span><span class="muted me-sum">${state.following.size} ${state.following.size === 1 ? 'person' : 'people'}</span><span class="muted">›</span></a>
      <div class="item me-link" id="meFace" hidden></div>
      <div class="item me-link">${ME_ICONS.email}<span class="me-label">Weekly email <span class="muted">(Sundays)</span></span><button class="chip ${state.me.weekly_email ? 'on' : ''}" data-act="toggleEmail">${state.me.weekly_email ? 'On' : 'Off'}</button></div>
    </div>
    <div class="list me-list">
      <a class="item me-link" href="#/help">${ME_ICONS.help}<span class="me-label">Help</span><span class="muted">›</span></a>
      <a class="item me-link" href="#/feedback">${ME_ICONS.feedback}<span class="me-label">Feedback</span><span class="muted">›</span></a>
      <a class="item me-link" href="#/about">${ME_ICONS.about}<span class="me-label">About and credits</span><span class="muted">›</span></a>
    </div>
    <div class="list">
      <button class="link" data-act="signOut">Sign out</button>
      <button class="link danger" data-act="deleteAccount">Delete my account</button>
    </div></div>`;
  const svcSummary = () => { const n = state.services?.filter((s) => s.ids.some((i) => myServices().includes(i))).length ?? 0; return n ? `${n} chosen` : 'None chosen'; };
  if (state.services) set('meSvcSum', svcSummary());

  // Everything at once, so the slowest request sets the wait instead of the sum of them.
  const [svcs, { count: nRatings }, { error: invitesClosed }, { data: keys, error: keysErr }, { data: reqs, error: reqsErr }, { data: inbox }, { data: fbs }, myInvites, { data: myLink }] = await Promise.all([
    state.services ? null : fn('services').then((r) => r.services).catch((e) => { console.error('services', e); return null; }),
    sb.from('ratings').select('title_id', { count: 'exact', head: true }).eq('user_id', state.me.id),
    sb.rpc('my_open_invites'), // missing until migration 006: then only hosts invite
    canPasskey() ? sb.auth.passkey.list() : Promise.resolve({ error: true }),
    // Invite requests: only the person in request_inbox gets rows back (migration 007); everyone else gets none.
    sb.from('invite_requests').select('id, name, email, knows, created_at').is('handled', null).order('created_at', { ascending: false }).limit(50),
    sb.rpc('gets_invite_requests'), // true only for you, so the section (and any error) shows only to you
    sb.from('feedback').select('*').is('resolved_at', null).order('created_at', { ascending: false }).limit(50), // only you get rows
    loadMyInvites(),
    sb.rpc('my_invite_link'), // missing until migration 021: then one-person links
  ]);
  if (svcs) state.services = svcs;
  if (!live()) return;
  if (reqsErr) console.error('invite_requests', reqsErr);

  set('meCount', `${nRatings ?? 0} rating${nRatings === 1 ? '' : 's'}`);
  // Hosts only: how many people have joined (members see every member, so this counts them all).
  if (state.me.is_host) sb.from('profiles').select('id', { count: 'exact', head: true }).eq('is_member', true)
    .then(({ count }) => { if (live() && count != null) set('meMembers', `<a href="#/members">${count} member${count === 1 ? '' : 's'} ›</a>`); });
  set('mePicksSum', nRatings ? String(nRatings) : '');
  if (state.services) { set('svc', serviceChips('toggleMySvc')); set('meSvcSum', svcSummary()); }

  if (invitesClosed ? state.me.is_host : true) {
    document.getElementById('meInv').hidden = false;
    set('inviteBox', myLink ? personalLink(myLink) : '<button class="primary big" data-act="invite">Invite someone</button>');
    const n = (k) => myInvites.filter((i) => inviteState(i) === k).length;
    if (n('pending') || n('joined')) {
      set('meInvSum', inviteCounts(myInvites));
      // Pending and Joined as their own rows (Nov 18), each opening just that list.
      set('meInvLink', `<div class="list">${['pending', 'joined'].filter(n).map((k) => `<a class="item" href="#/invites/${k}"><span>${k === 'pending' ? 'Pending' : 'Joined'}</span><span class="muted">${n(k)} ›</span></a>`).join('')}</div>`);
    }
  }
  if (!keysErr) {
    const on = Array.isArray(keys) && keys.length > 0, face = document.getElementById('meFace');
    face.innerHTML = `${ME_ICONS.face}<span class="me-label">Sign in with ${bioName()}</span>${on ? '<span class="muted me-sum">On</span>' : '<button data-act="addPasskey">Turn on</button>'}`;
    face.hidden = false;
  }

  const admin = [];
  if (reqs?.length || inbox) admin.push(meRow('meReq', 'requests', 'Invite requests', reqs?.length
    ? `<div class="list">${reqs.map((r) => `<div class="req" id="req${r.id}">
        <strong>${esc(r.name)}</strong>
        <span class="muted">Knows: ${esc(r.knows) || '(left blank)'}</span>
        <span class="muted small">${esc(r.email)} · ${when(r.created_at)}</span>
        <div class="row"><button class="primary" data-act="inviteRequest" data-id="${r.id}" data-email="${esc(r.email)}" data-name="${esc(r.name)}">Email invite</button>
          <button data-act="skipRequest" data-id="${r.id}">Not now</button></div></div>`).join('')}</div>`
    : `<p class="muted">${reqsErr ? `Couldn’t load requests: ${esc(reqsErr.message)} (${esc(reqsErr.code ?? '')})` : 'No new requests.'}</p>`, ' class="me-req"'));
  if (fbs?.length) admin.push(meRow('meFb', 'feedback', 'Feedback', `<div class="list">${fbs.map((f) => `<div class="req" id="fb${f.id}">
        <span><strong>${f.kind === 'bug' ? 'Bug' : 'Suggestion'}</strong> · ${FB_APPS[f.app]}</span>
        <div class="note">${esc(f.message)}</div>
        <span class="muted small">${f.user_id ? personLink(f.user_id) : esc(f.name)} · ${when(f.created_at)}</span>
        <div class="row"><button data-act="resolveFeedback" data-id="${f.id}">Resolve</button></div></div>`).join('')}</div>`));
  if (admin.length) {
    const box = document.getElementById('meAdmin');
    box.innerHTML = admin.join(''); box.hidden = false;
    if (reqs?.length) set('meReqSum', `<span class="pill">${reqs.length} new</span>`);
    if (fbs?.length) set('meFbSum', `<span class="pill">${fbs.length} open</span>`);
  }
}
actions.toggleMySvc = async (d, el) => {
  actions.toggleSvc(d, el);
  const services = chosenServiceIds();
  await sb.from('profiles').update({ services }).eq('id', state.me.id);
  state.me.services = services;
  const sum = document.getElementById('meSvcSum');
  if (sum) sum.textContent = services.length ? `${state.services.filter((s) => s.ids.some((i) => services.includes(i))).length} chosen` : 'None chosen';
};
actions.toggleEmail = async (d, el) => {
  state.me.weekly_email = !state.me.weekly_email;
  await sb.from('profiles').update({ weekly_email: state.me.weekly_email }).eq('id', state.me.id);
  el.textContent = state.me.weekly_email ? 'On' : 'Off'; el.classList.toggle('on', state.me.weekly_email);
};
// Profile photo: pick a picture, drag and zoom it inside the circle, then upload a 256px square JPEG.
function loadImage(file) {
  return new Promise((ok, fail) => {
    const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = URL.createObjectURL(file);
  });
}
async function setAvatar(url) {
  const { error } = await sb.from('profiles').update({ avatar_url: url }).eq('id', state.me.id);
  if (error) throw error;
  state.me.avatar_url = url;
  const p = state.people.get(state.me.id); if (p) p.avatar_url = url;
}
async function uploadAvatar(blob) {
  const path = `${state.me.id}/avatar.jpg`;
  const { error } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  const { data } = sb.storage.from('avatars').getPublicUrl(path);
  await setAvatar(`${data.publicUrl}?t=${Date.now()}`); // new address each time so old copies don't linger
}
function openCropper(img) {
  const V = Math.min(300, window.innerWidth - 64); // size of the square frame on screen
  const W = img.naturalWidth, H = img.naturalHeight;
  const cover = V / Math.min(W, H);                 // smallest scale that still fills the circle
  let zoom = 1, x = 0, y = 0;
  const box = document.createElement('div');
  box.className = 'cropper';
  box.innerHTML = `<div class="cropper-panel" role="dialog" aria-modal="true" aria-label="Adjust your photo">
      <h2>Adjust your photo</h2>
      <p class="muted">Drag to move. Use the slider to zoom.</p>
      <div class="crop-frame" style="width:${V}px;height:${V}px"><img alt="" draggable="false"><div class="crop-ring"></div></div>
      <label class="crop-zoom"><span class="muted">Zoom</span><input type="range" min="1" max="4" step="0.01" value="1"></label>
      <div class="row"><button data-crop="cancel">Cancel</button><button class="primary" data-crop="save">Save photo</button></div>
    </div>`;
  document.body.appendChild(box);
  const pic = box.querySelector('img'), frame = box.querySelector('.crop-frame'), slider = box.querySelector('input');
  pic.src = img.src;
  const size = () => ({ w: W * cover * zoom, h: H * cover * zoom });
  function draw() {
    const { w, h } = size();
    x = Math.min(0, Math.max(V - w, x)); y = Math.min(0, Math.max(V - h, y)); // keep the circle filled
    pic.style.width = `${w}px`; pic.style.height = `${h}px`; pic.style.transform = `translate(${x}px, ${y}px)`;
  }
  { const { w, h } = size(); x = (V - w) / 2; y = (V - h) / 2; } // start centered
  draw();
  slider.addEventListener('input', () => {
    const old = size(), cx = (V / 2 - x) / old.w, cy = (V / 2 - y) / old.h; // zoom around the middle
    zoom = Number(slider.value);
    const now = size(); x = V / 2 - cx * now.w; y = V / 2 - cy * now.h; draw();
  });
  let drag = null;
  frame.addEventListener('pointerdown', (e) => { drag = { px: e.clientX, py: e.clientY, x, y }; frame.setPointerCapture(e.pointerId); });
  frame.addEventListener('pointermove', (e) => { if (!drag) return; x = drag.x + e.clientX - drag.px; y = drag.y + e.clientY - drag.py; draw(); });
  frame.addEventListener('pointerup', () => { drag = null; });
  frame.addEventListener('pointercancel', () => { drag = null; });
  const close = () => { URL.revokeObjectURL(img.src); box.remove(); };
  box.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-crop]')?.dataset.crop;
    if (act === 'cancel') return close();
    if (act !== 'save') return;
    e.target.disabled = true; e.target.textContent = 'Saving…';
    try {
      const scale = cover * zoom, c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d').drawImage(img, -x / scale, -y / scale, V / scale, V / scale, 0, 0, 256, 256);
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
      await uploadAvatar(blob);
      close(); toast('Photo saved'); route();
    } catch (err) { console.error(err); e.target.disabled = false; e.target.textContent = 'Save photo'; toast('Couldn’t save that photo. Try again.'); }
  });
}
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'photoInput' || !e.target.files?.[0]) return;
  try { openCropper(await loadImage(e.target.files[0])); }
  catch (err) { console.error(err); toast('Couldn’t open that photo. Try another one.'); }
  e.target.value = ''; // so picking the same photo again still works
});
actions.removePhoto = async () => {
  await sb.storage.from('avatars').remove([`${state.me.id}/avatar.jpg`]);
  await setAvatar(null);
  toast('Photo removed');
  route();
};
actions.saveName = async () => {
  const name = document.getElementById('myName').value.trim();
  if (!name) return toast('Name can’t be empty');
  await sb.from('profiles').update({ name }).eq('id', state.me.id);
  state.me.name = name;
  document.querySelector('main h1').textContent = name;
  document.getElementById('myName').blur();
  toast('Name saved');
};
// Your invite link (migration 021, Nov 22): one per person, works for anyone, never expires.
// One-person links were hurting sign-ups because people didn't pass them on.
function personalLink(code) {
  const url = `${location.origin}${location.pathname}?invite=${code}`;
  return `<div class="field"><p>Your invite link works for anyone you send it to, as often as you like. Text it, email it, or drop it in a group chat.</p>
    <input readonly value="${esc(url)}" id="inviteUrl" aria-label="Your invite link">
    <button class="primary big" data-act="shareInvite">Send link</button>
    <button class="big" data-act="copyInvite">Copy link</button></div>`;
}
// Before migration 021: one-person links. Each one works once, for 7 days. "Who's it for?" is optional and only you see it.
async function insertInvite(forName) {
  const row = { created_by: state.me.id };
  if (forName) row.for_name = forName.slice(0, 80);
  return sb.from('invites').insert(row).select('code').single();
}
// Only blame the 10-link limit when that's what refused it (a row-level security refusal); hosts have no limit (migration 016).
function inviteError(error) {
  console.error('invite', error);
  return error.code === '42501' && !state.me?.is_host
    ? 'Couldn’t make a link. You can have up to 10 unused links at a time.'
    : 'Couldn’t make a link. Check your connection and try again.';
}
actions.invite = () => {
  document.getElementById('inviteBox').innerHTML = `<div class="card field">
    <label for="inviteFor">Who’s it for? (optional)</label>
    <input id="inviteFor" maxlength="80" autocomplete="off" placeholder="Their name">
    <p class="muted small">Only you see this, on My invites.</p>
    <button class="primary big" data-act="makeInvite">Make link</button></div>`;
  document.getElementById('inviteFor').focus();
};
actions.makeInvite = async (d, el) => {
  el.disabled = true;
  const forName = document.getElementById('inviteFor')?.value.trim() || '';
  const { data, error } = await insertInvite(forName);
  if (error) { el.disabled = false; return toast(inviteError(error)); }
  const url = `${location.origin}${location.pathname}?invite=${data.code}`;
  document.getElementById('inviteBox').innerHTML = `<div class="card field">
    <p><strong>${forName ? `For ${esc(forName)} only.` : 'For one person only.'}</strong> The link works once, for 7 days.</p>
    <input readonly value="${esc(url)}" id="inviteUrl" aria-label="Invite link">
    <button class="primary big" data-act="shareInvite">Send link</button>
    <button class="big" data-act="invite">New link</button></div>`;
};
// Make a fresh one-person link and open a ready-to-send email to the requester in your Mail app.
actions.inviteRequest = async (d, el) => {
  el.disabled = true;
  const { data, error } = await insertInvite(d.name);
  if (error) { el.disabled = false; return toast(inviteError(error)); }
  const url = `${location.origin}${location.pathname}?invite=${data.code}`;
  await sb.from('invite_requests').update({ handled: 'invited', handled_at: new Date().toISOString() }).eq('id', d.id);
  const first = d.name.split(/\s+/)[0];
  const body = [`Hi ${first},`, 'Here’s your invite to TV Rex, where friends and family share what they’re watching:', url,
    'The link works only once, for 7 days.', state.me.name].join('\r\n\r\n'); // mail links need \r\n for line breaks
  location.href = `mailto:${encodeURIComponent(d.email)}?subject=${encodeURIComponent('Your TV Rex invite')}&body=${encodeURIComponent(body)}`;
  doneRequest(d.id, 'Invite ready in Mail');
};
actions.skipRequest = async (d, el) => {
  el.disabled = true;
  await sb.from('invite_requests').update({ handled: 'not_now', handled_at: new Date().toISOString() }).eq('id', d.id);
  doneRequest(d.id, 'Request hidden');
};
function doneRequest(id, msg) {
  document.getElementById(`req${id}`)?.remove();
  const left = document.querySelectorAll('.me-req .req').length;
  const pill = document.querySelector('#meReqSum .pill');
  if (!left) { document.querySelector('.me-req')?.remove(); const box = document.getElementById('meAdmin'); if (box && !box.children.length) box.hidden = true; }
  else if (pill) pill.textContent = `${left} new`;
  toast(msg);
  updateActivityDot();
}
actions.shareInvite = async () => {
  const url = document.getElementById('inviteUrl').value;
  // The phone or computer's share menu where there is one; otherwise copy the link.
  // Hosts (Leigh) get a personal line; everyone else gets the general one.
  const text = state.me.is_host ? 'I made this app to share TV recommendations with friends:' : 'Let’s share what we’re watching on TV Rex:';
  if (navigator.share) await navigator.share({ title: text.slice(0, -1), text, url }).catch(() => {});
  else await actions.copyInvite();
};
actions.copyInvite = async () => { await navigator.clipboard.writeText(document.getElementById('inviteUrl').value); toast('Link copied'); };
actions.unsubscribe = async (d, el) => {
  el.disabled = true;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/digest?u=${encodeURIComponent(d.u)}&t=${encodeURIComponent(d.t)}`, { method: 'POST' }).catch(() => null);
  if (state.me && res?.ok) state.me.weekly_email = false;
  history.replaceState(null, '', '#/feed');
  $app.innerHTML = res?.ok
    ? `<section><h1>You’re unsubscribed</h1><p>You won’t get the Sunday email anymore. To turn it back on, go to your Me page and set <b>Weekly email</b> to <b>On</b>.</p><p><a class="btn primary big" href="#/feed">Open TV Rex</a></p></section>`
    : `<section><h1>That didn’t work</h1><p>Turn the Sunday email off on your Me page instead: <b>Weekly email</b>, then <b>Off</b>.</p><p><a class="btn primary big" href="#/feed">Open TV Rex</a></p></section>`;
};
actions.signOut = async () => {
  localStorage.removeItem('tv_invite'); localStorage.removeItem(feedKey());
  await sb.auth.signOut();
};
actions.deleteAccount = async () => {
  if (!confirm('Delete your account and all your ratings? This can’t be undone.')) return;
  await sb.rpc('delete_my_account');
  await sb.auth.signOut();
};

function viewAbout() {
  $app.innerHTML = `
    <a href="#/me">← Back</a>
    <div class="about-head"><img src="icon.png?v=5" alt="" width="72" height="72">
      <div><h1>About TV Rex</h1><p class="muted">TV and movie recommendations by your friends and family</p></div></div>
    <div class="card about-card about-version"><span>Version ${new URL(import.meta.url).searchParams.get('v') ?? ''}</span><span class="muted" id="updatedOn"></span></div>
    <div class="about-section"><h2 class="section-label">How it works</h2>
      <div class="list intro">
        ${introRow('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', 'Rate what you watch', 'Say if you loved it, liked it, didn’t like it or gave up, and add a note if you want.')}
        ${introRow('<path d="M6 3h12v18l-6-4-6 4z"/><path d="M12 7v6M9 10h6"/>', 'Save friends’ picks', 'Keep a list of what you’re watching and what’s next.')}
        ${introRow('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>', 'See where it’s streaming', 'Every show lists the services it’s on.')}
        ${introRow('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', 'Sunday email', 'Up to three picks from people you follow.')}
      </div></div>
    <div class="about-section"><h2 class="section-label">Credits</h2>
      <div class="card about-card about-credits">
        <p>Made by <a href="https://xoleigh.com">Leigh</a> &amp; <a href="https://claude.ai">Claude</a>.</p>
        <p>Title data and images from <a href="https://www.themoviedb.org">TMDB</a>. Streaming data from <a href="https://www.justwatch.com">JustWatch</a>. Dinosaur from <a href="https://github.com/googlefonts/noto-emoji">Noto Emoji</a> (Apache 2.0).</p>
        <p class="muted">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        <a class="tmdb-logo" href="https://www.themoviedb.org"><img src="https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="TMDB" height="14"></a>
      </div></div>`;
  // "Updated Nov 18": the newest release note's date.
  fetch('./updates.json', { cache: 'no-store' }).then((r) => r.json()).then((u) => {
    const el = document.getElementById('updatedOn');
    if (el && u[0]?.date) el.textContent = 'Updated ' + new Date(u[0].date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }).catch(() => {});
}

// ---------------------------------------------------------------- feedback

const FB_APPS = { tv: 'TV Rex', walk: 'Wiki Walk', other: 'Other' };
// Open to everyone: Wiki Walk links here (#/feedback/walk). Signed in, your name is filled in for you.
function viewFeedback(app) {
  state.fb = { app: FB_APPS[app] ? app : 'tv', kind: 'bug' };
  const signedIn = !!state.me;
  const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) =>
    `<button type="button" class="${state.fb[key] === v ? 'on' : ''}" aria-pressed="${state.fb[key] === v}" data-act="pickFb" data-key="${key}" data-val="${v}">${l}</button>`).join('')}</div>`;
  const fromWalk = app === 'walk';
  $nav.hidden = !signedIn || state.me.is_member === false;
  $app.innerHTML = `
    ${fromWalk ? '<a href="https://walk.xoleigh.com">← Wiki Walk</a>' : signedIn ? '<a href="javascript:history.back()">← Back</a>' : BRAND}
    <h1>Feedback</h1>
    <form class="field" id="fbForm" onsubmit="return false">
      <label>Which app?</label>${seg('app', Object.entries(FB_APPS))}
      <label>Bug or suggestion?</label>${seg('kind', [['bug', 'Bug'], ['suggestion', 'Suggestion']])}
      <label for="fbMsg">Tell me more</label>
      <textarea id="fbMsg" rows="5" maxlength="2000"></textarea>
      ${signedIn ? '' : '<label for="fbName">Your name</label><input id="fbName" maxlength="80" autocomplete="name">'}
      <button class="primary big" type="button" data-act="sendFeedback">Submit</button>
    </form>`;
}
actions.pickFb = (d, el) => {
  state.fb[d.key] = d.val;
  el.parentElement.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === el); b.setAttribute('aria-pressed', b === el); });
};
actions.sendFeedback = async (d, el) => {
  const message = document.getElementById('fbMsg').value.trim();
  const name = document.getElementById('fbName')?.value.trim() ?? '';
  if (!message) return toast('Tell me a little more first');
  if (!state.me && !name) return toast('Add your name so Leigh can reply');
  el.disabled = true;
  const { data, error } = await sb.rpc('send_feedback', { p_app: state.fb.app, p_kind: state.fb.kind, p_message: message, p_name: name });
  if (error || !data) { el.disabled = false; return toast('Couldn’t send. Try again.'); }
  const back = location.hash.startsWith('#/feedback/walk') ? '<a class="btn big" href="https://walk.xoleigh.com">Back to Wiki Walk</a>'
    : state.me ? '<a class="btn big" href="#/feed">Back to the feed</a>' : '';
  $app.innerHTML = `<h1>Thanks!</h1><p>Leigh will see this and get back to you.</p>${back}`;
};
actions.resolveFeedback = async (d, el) => {
  el.disabled = true;
  const { error } = await sb.from('feedback').update({ resolved_at: new Date().toISOString() }).eq('id', d.id);
  if (error) { el.disabled = false; throw error; }
  document.getElementById('fb' + d.id)?.remove();
  toast('Resolved');
  updateActivityDot();
};

// ---------------------------------------------------------------- my invites

async function loadMyInvites() {
  const cols = 'code, created_at, used_by, used_at, expires_at';
  const { data } = await sb.from('invites').select(cols + ', for_name').eq('created_by', state.me.id).order('created_at', { ascending: false });
  return data ?? [];
}
const inviteState = (i) => i.used_by ? 'joined' : new Date(i.expires_at) > new Date() ? 'pending' : 'expired';
// Expired links drop off on their own (Nov 16); joined people and pending links show.
function inviteCounts(list) {
  const n = (k) => list.filter((i) => inviteState(i) === k).length;
  return [n('joined') ? `${n('joined')} joined` : '', n('pending') ? `${n('pending')} pending` : ''].filter(Boolean).join(' · ') || 'none pending';
}
function expiresIn(ts) {
  const days = Math.ceil((new Date(ts) - Date.now()) / 86400000);
  return days <= 1 ? 'expires within a day' : `expires in ${days}d`;
}
// Open links can be removed (migration 016).
const removeBtn = (i, live) => `<button class="small" data-act="removeInvite" data-code="${esc(i.code)}" data-live="${live ? 1 : ''}" aria-label="Remove ${i.for_name ? 'link for ' + esc(i.for_name) : 'this link'}">Remove</button>`;
actions.removeInvite = async (d, el) => {
  if (d.live && !confirm('Remove this link? It will stop working.')) return;
  el.disabled = true;
  const { error, count } = await sb.from('invites').delete({ count: 'exact' }).eq('code', d.code).is('used_by', null);
  if (error || !count) { el.disabled = false; console.error('remove invite', error); return toast('Couldn’t remove that link. Try again.'); }
  toast('Link removed');
  route(); // stays on whichever list you were on
};
async function viewInvites(group) {
  const list = await loadMyInvites();
  if (list.some((i) => i.used_by && !state.people.has(i.used_by))) await loadPeople(); // someone joined since the app opened
  const of = (k) => list.filter((i) => inviteState(i) === k);
  const forLine = (i) => i.for_name ? `For ${esc(i.for_name)}` : 'Invite link';
  const pending = group === 'joined' ? [] : of('pending'), joined = group === 'pending' ? [] : of('joined');
  const title = group === 'pending' ? 'Pending invites' : group === 'joined' ? 'Joined' : 'My invites';
  $app.innerHTML = `
    <a href="#/me">← Me</a>
    <div><h1>${title}</h1>${group === 'joined' ? '' : '<span class="muted">Expired links drop off this list on their own.</span>'}</div>
    ${pending.length || joined.length ? '' : `<p class="empty">${group === 'pending' ? 'No pending invites.' : group === 'joined' ? 'No one has joined yet.' : 'No invites yet. Tap Invite someone on Me.'}</p>`}
    ${pending.length ? `${group ? '' : '<h2>Pending</h2>'}<div class="list">${pending.map((i) => `<div class="spread"><span><strong>${forLine(i)}</strong><br><span class="muted">Made ${when(i.created_at)} · ${expiresIn(i.expires_at)}</span></span>${removeBtn(i, true)}</div>`).join('')}</div>` : ''}
    ${joined.length ? `${group ? '' : '<h2>Joined</h2>'}<div class="list">${joined.map((i) => state.people.get(i.used_by)?.name
      ? `<a class="item" href="#/friend/${encodeURIComponent(i.used_by)}"><span class="row" style="flex-wrap:nowrap">${avatar(i.used_by)}<span>${esc(nameOf(i.used_by))}<br><span class="muted">Joined ${when(i.used_at)}</span></span></span><span class="muted">›</span></a>`
      : `<div><strong>${i.for_name ? esc(i.for_name) : 'Someone'}</strong><br><span class="muted">Joined ${when(i.used_at)}${state.people.has(i.used_by) ? ' · hasn’t finished signing up' : ''}</span></div>`).join('')}</div>` : ''}`;
  // A new account has a blank name until Welcome is finished (migration 004), so fall back to the invite's "who's it for" name.
}

// Members (hosts only, Nov 20): everyone who has joined, newest first, grouped by month,
// with email and who invited them. host_members() returns nothing for non-hosts (migration 020).
async function viewMembers() {
  if (!state.me.is_host) { location.hash = '#/me'; return; }
  const { data, error } = await sb.rpc('host_members');
  if (error) { console.error('host_members', error); $app.innerHTML = '<a href="#/me">← Me</a><p class="empty">Couldn’t load members. Run migration 020 in Supabase.</p>'; return; }
  const rows = data ?? [];
  const month = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'long', year: new Date(ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  const day = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const by = (m) => m.is_host && !m.invited_by ? 'host' : !m.invited_by ? 'no invite' : isMe(m.invited_by) ? 'invited by you' : `invited by ${esc(m.invited_by_name || 'someone')}`;
  const groups = [];
  for (const m of rows) { const k = month(m.joined_at); if (groups.at(-1)?.k !== k) groups.push({ k, list: [] }); groups.at(-1).list.push(m); }
  const row = (m) => {
    const done = m.onboarded && m.name;
    const name = esc(m.name || m.for_name || 'Someone') + (isMe(m.id) ? ' (you)' : '');
    const lines = `<span>${name}<br><span class="muted small">Joined ${day(m.joined_at)} · ${by(m)}${done ? '' : ' · hasn’t finished signing up'}</span><br><span class="muted small">${esc(m.email)}</span></span>`;
    return done
      ? `<a class="item" href="#/friend/${encodeURIComponent(m.id)}"><span class="row" style="flex-wrap:nowrap">${avatar(m.id, state.people.get(m.id) ?? m)}${lines}</span><span class="muted">›</span></a>`
      : `<div class="item"><span class="row" style="flex-wrap:nowrap">${avatar(m.id, state.people.get(m.id) ?? m)}${lines}</span></div>`;
  };
  $app.innerHTML = `
    <a href="#/me">← Me</a>
    <div><h1>Members</h1><span class="muted">${rows.length} ${rows.length === 1 ? 'person' : 'people'} · newest first</span></div>
    ${groups.map((g) => `<h2>${g.k}</h2><div class="list">${g.list.map(row).join('')}</div>`).join('')}`;
}

// ---------------------------------------------------------------- friend profile

// Poster row that scrolls sideways (like Goodreads' "Recently read"). Each poster opens the title.
const SHELF_MAX = 12;
function shelf(rows, seeAll) {
  return `<div class="shelf">${rows.slice(0, SHELF_MAX).map((r) => `<a href="${titleLink(r.titles)}">
      ${poster(r.titles.poster_path, 'tile')}<span class="t">${esc(r.titles.name)}</span></a>`).join('')}
    ${rows.length > SHELF_MAX ? `<a class="shelf-more" href="${seeAll}">See all ›</a>` : ''}</div>`;
}

// Profile: a summary (counts plus poster rows). The full list is one tap away, a page at a time.
async function viewFriend(id, filter) {
  // People were loaded when the app opened; refresh them in the background, and wait only for someone new.
  const people = loadPeople().catch((e) => console.error(e));
  const ratings = sb.from('ratings').select('user_id, title_id, rating, note, season, activity_at, titles(*)').eq('user_id', id).order('activity_at', { ascending: false });
  const mineToo = filter ? Promise.all([
    sb.from('watchlist').select('title_id').is('watched_at', null),
    sb.from('ratings').select('title_id, rating, season').eq('user_id', state.me.id),
  ]) : null;
  if (!state.people.has(id)) await people;
  const p = state.people.get(id);
  if (!p) { $app.innerHTML = '<p class="empty">Not found.</p>'; return; }
  const { data: rs } = await ratings;
  if (!filter) return friendSummary(id, p, rs ?? []);
  return friendList(id, p, rs ?? [], filter, PAGE, mineToo);
}

function friendSummary(id, p, rs) {
  const of = (k) => rs.filter((r) => r.rating === k);
  const base = `#/friend/${encodeURIComponent(id)}`;
  const stat = (n, label, f) => `<a href="${base}/${f}"><strong>${n}</strong><span>${label}</span></a>`;
  const section = (k, label) => of(k).length ? `<div class="spread shelf-head"><h2>${label}</h2><a class="small" href="${base}/${k}">See all ${of(k).length}</a></div>${shelf(of(k), `${base}/${k}`)}` : '';
  $app.innerHTML = `
    <a href="javascript:history.back()">← Back</a>
    <div class="profile-head">${avatar(id, p).replace('class="avatar"', 'class="avatar lg"')}
      <div class="profile-name"><h1>${esc(isMe(id) ? 'My ratings' : p.name)}</h1>
        ${!isMe(id) ? followButton(id) : ''}</div></div>
    <div class="stats">${stat(rs.length, rs.length === 1 ? 'Rating' : 'Ratings', 'all')}${stat(of('loved').length, 'Loved', 'loved')}${stat(of('liked').length, 'Liked', 'liked')}</div>
    ${rs.length ? `<div class="spread shelf-head"><h2>Recently rated</h2><a class="small" href="${base}/all">See all</a></div>${shelf(rs, `${base}/all`)}` : '<p class="empty">Nothing rated yet.</p>'}
    ${section('loved', 'Loved')}
    ${section('liked', 'Liked')}
    ${section('didnt_like', 'Didn’t like')}
    ${section('gave_up', 'Gave up')}`;
}

const PAGE = 20;
async function friendList(id, p, all, filter, limit = PAGE, mineToo = null) {
  const [{ data: wl }, { data: myR }] = await (mineToo ?? Promise.all([
    sb.from('watchlist').select('title_id').is('watched_at', null),
    sb.from('ratings').select('title_id, rating, season').eq('user_id', state.me.id),
  ]));
  const saved = new Set((wl ?? []).map((w) => w.title_id));
  const myRating = new Map((myR ?? []).map((r) => [r.title_id, r]));
  const match = (r) => filter === 'all' || (filter === 'mixed' ? !POSITIVE.includes(r.rating) : r.rating === filter);
  const matching = all.filter(match);
  const shown = matching.slice(0, limit);
  const heading = { all: 'All ratings', loved: 'Loved', liked: 'Liked', didnt_like: 'Didn’t like', gave_up: 'Gave up', mixed: 'Didn’t like or gave up' }[filter] ?? 'All ratings';
  await loadProviders(shown.map((r) => r.title_id));
  $app.innerHTML = `
    <a href="#/friend/${encodeURIComponent(id)}">← ${esc(isMe(id) ? 'My ratings' : p.name)}</a>
    <div><h1>${heading}</h1><span class="muted">${matching.length} title${matching.length === 1 ? '' : 's'}</span></div>
    ${shown.length ? shown.map((r) => `<div class="card pick-card"><div class="pick">
      <a href="${titleLink(r.titles)}">${poster(r.titles.poster_path, 'sm')}</a>
      <div class="pick-body"><a class="title" href="${titleLink(r.titles)}">${esc(r.titles.name)}</a>
        <span class="muted">${filter === 'all' || filter === 'mixed' ? ratingLabel(r) + ' · ' : ''}${kind(r.titles)}${filter !== 'all' && filter !== 'mixed' && r.season ? ' · S' + r.season : ''}</span>${watchOn(r.title_id)}
        ${r.note ? `<div class="note clamp">${esc(r.note)}</div><button class="link small readmore" data-act="readMore" hidden>Read more</button>` : ''}</div></div>
      ${isMe(id) ? '' : `<div class="row actions">${myRating.has(r.title_id) ? `<span class="muted">You: <strong>${ratingLabel(myRating.get(r.title_id))}</strong></span>`
        : saved.has(r.title_id) ? SAVED
        : `<button class="primary" data-act="save" data-id="${esc(r.title_id)}">+ Want to watch</button>`}
        ${myRating.has(r.title_id) ? '' : `<button data-act="seenIt" data-id="${esc(r.title_id)}">Seen it</button>`}</div>`}</div>`).join('')
      : '<p class="empty">Nothing here yet.</p>'}
    ${matching.length > shown.length ? `<button class="big" data-act="friendMore">Show more · ${matching.length - shown.length} left</button>` : ''}`;
  state.friendCtx = { id, p, all, filter, limit };
}
actions.friendMore = async () => {
  const { id, p, all, filter, limit } = state.friendCtx;
  const y = window.scrollY;
  await friendList(id, p, all, filter, limit + PAGE);
  window.scrollTo(0, y);
};

// ---------------------------------------------------------------- following
const followButton = (id) => state.following.has(id)
  ? `<button class="saved-btn" data-act="unfollow" data-id="${id}">✓ Following</button>`
  : `<button class="primary" data-act="follow" data-id="${id}">+ Follow</button>`;
actions.follow = async (d, el) => {
  const { error } = await sb.from('follows').insert({ follower: state.me.id, followee: d.id });
  if (error && error.code !== '23505') return toast('Couldn’t follow. Try again.');
  state.following.add(d.id);
  el.outerHTML = followButton(d.id);
  toast(`Following ${nameOf(d.id)}`);
};
actions.unfollow = async (d, el) => {
  if (!confirm(`Stop following ${nameOf(d.id)}?`)) return;
  await sb.from('follows').delete().eq('follower', state.me.id).eq('followee', d.id);
  state.following.delete(d.id);
  if (el.dataset.row) el.closest('.item').remove(); else el.outerHTML = followButton(d.id);
};
async function viewFollowing() {
  await loadPeople();
  const ids = [...state.following].filter((id) => state.people.has(id)).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  $app.innerHTML = `
    <a href="javascript:history.back()">← Back</a>
    <h1>Following</h1>
    ${ids.length ? `<div class="list">${ids.map((id) => `<div class="item"><a class="person" href="#/friend/${id}">${esc(nameOf(id))}</a>
      <button data-act="unfollow" data-id="${id}" data-row="1">Unfollow</button></div>`).join('')}</div>`
      : '<p class="empty">You’re not following anyone yet.</p>'}
    <p class="muted">Find people by tapping a name on any review in Everyone.</p>`;
}

// ---------------------------------------------------------------- updates
(async () => {
  try {
    const mine = new URL(import.meta.url).searchParams.get('v');
    const html = await (await fetch(`./index.html?check=${Date.now()}`, { cache: 'no-store' })).text();
    const latest = html.match(/app\.js\?v=(\d+)/)?.[1];
    if (mine && latest && latest !== mine && sessionStorage.getItem('tv_reloaded') !== latest) {
      sessionStorage.setItem('tv_reloaded', latest);
      location.replace(`${location.pathname}?v=${latest}${location.hash}`);
    }
  } catch {}
})();

// ---------------------------------------------------------------- start

const invite = new URLSearchParams(location.search).get('invite');
if (invite) {
  localStorage.setItem('tv_invite', invite);
  history.replaceState(null, '', location.pathname + location.hash);
}

sb.auth.onAuthStateChange((event, session) => {
  const was = state.session?.user?.id;
  state.session = session;
  // Defer: calling Supabase inside this callback can stall the client.
  setTimeout(async () => {
    if (!session) { state.me = null; state.people.clear(); return route(); }
    if (session.user.id !== was) {
      state.me = null;
      await redeemPendingInvite();
      // Supabase also says SIGNED_IN when it restores a saved session on reload; only a real sign-in
      // (from the sign-in screen or an email link) jumps to the feed. Otherwise stay on the page you were on.
      const fresh = state.codeSignIn || !location.hash || /^#\/(signin|request)?$|access_token/.test(location.hash);
      if (event === 'SIGNED_IN' && fresh) return signedIn();
      route();
    }
  }, 0);
});

// Right after signing in (by code or by the email link): go straight to the feed.
// First-timers are sent on to Welcome by route().
async function signedIn() {
  const offer = state.codeSignIn && await shouldOfferPasskey();
  state.codeSignIn = false;
  history.replaceState(null, '', location.pathname + (offer ? '#/passkey' : '#/feed'));
  route();
}

// ---------------------------------------------------------------- pull to refresh
// From the Home Screen, iOS gives web apps no pull-to-refresh (Safari tabs have their own), so add one.
// The page itself stays put (no rubber band); a small circle slides down, spins, and the current page
// redraws with fresh data, without a full reload. A new app version still reloads the whole app.
if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) {
  document.documentElement.classList.add('standalone');
  const ptr = document.createElement('div');
  ptr.className = 'ptr'; ptr.setAttribute('aria-hidden', 'true');
  ptr.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>';
  document.body.append(ptr);
  const PULL = 70, MAX = 110;
  let startY = null, dy = 0, busy = false;
  const place = (y, turn) => { ptr.style.transform = `translate(-50%, ${y}px) rotate(${turn}deg)`; };
  const reset = () => { ptr.classList.remove('dragging', 'ready', 'loading'); ptr.style.transform = ''; };
  addEventListener('touchstart', (e) => {
    startY = !busy && window.scrollY <= 0 && e.touches.length === 1 && !document.body.classList.contains('sheet-open') ? e.touches[0].clientY : null;
    dy = 0;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (startY === null) return;
    if (window.scrollY > 0) { startY = null; return reset(); }
    dy = Math.max(0, e.touches[0].clientY - startY);
    const d = Math.min(dy * 0.6, MAX);
    ptr.classList.add('dragging');
    ptr.classList.toggle('ready', dy * 0.6 >= PULL);
    place(d - 48, d * 3);
  }, { passive: true });
  addEventListener('touchend', async () => {
    if (startY === null) return;
    startY = null;
    if (dy * 0.6 < PULL) return reset();
    busy = true;
    ptr.classList.remove('dragging'); ptr.classList.add('loading'); place(PULL - 30, 0);
    try {
      const html = await (await fetch(`./index.html?check=${Date.now()}`, { cache: 'no-store' })).text();
      const latest = html.match(/app\.js\?v=(\d+)/)?.[1];
      const mine = document.querySelector('script[src*="app.js?v="]')?.src.match(/v=(\d+)/)?.[1];
      if (latest && mine && latest !== mine) return location.replace(`${location.pathname}?v=${latest}${location.hash}`);
      if (state.session) await loadPeople();
      await route();
    } catch (e) { console.error('refresh', e); }
    busy = false; reset();
  });
}
