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
const ROUND = 15;
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
const isMine = (svc) => svc.ids.some((i) => myServices().includes(i));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const poster = (path, cls = '') => path
  ? `<img class="poster ${cls}" src="${IMG}${cls === 'xl' || cls === 'lg' ? 'w342' : 'w185'}${esc(path)}" alt="" loading="lazy">`
  : `<div class="poster ${cls}" aria-hidden="true"></div>`;
const kind = (t) => `${t.media_type === 'tv' ? 'TV' : 'Movie'}${t.year ? ' · ' + t.year : ''}`;
const BRAND = `<header class="brand">
  <svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="currentColor"/><defs><clipPath id="rexscreen"><rect x="10" y="15" width="44" height="31" rx="5"/></clipPath></defs><rect x="10" y="15" width="44" height="31" rx="5" fill="#fff"/><g clip-path="url(#rexscreen)"><path d="M13 42C18.5 41 23 38.5 26.5 35.5L28 30C28 25.2 31.4 21.5 36.2 21.5L43.5 21.5C46.3 21.5 48.5 23.5 48.5 26.3L48.5 29.6C48.5 31 47.5 31.9 46 32.2L40.6 33.3L39 36.2C37.4 39.3 34.6 41.3 31 41.8C25 42.7 19 42.8 13 42Z" fill="#4E9A45"/><path d="M27 40.5L26.6 46H30.2L30.6 41.5ZM32.4 40.8L33 46H36.6L35.8 40.2Z" fill="#4E9A45"/><path d="M38.8 35.6l2.6 1.1v1.7" fill="none" stroke="#4E9A45" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="38.6" cy="25.4" r="1.6" fill="#fff"/><path d="M40.8 29.2c2.2 1.1 4.6 1.1 6.6-.1" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/></g><path d="M24 54h16" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>
  <div><h1>TV Rex</h1><p class="tagline">Picks from friends and family</p></div></header>`;
const personLink = (id) => `<a class="person" href="#/friend/${encodeURIComponent(id)}">${esc(nameOf(id))}</a>`;
const SAVED = '<span class="btn saved">✓ Saved</span>'; // shown in place of + Want to watch once a title is on your list
const titleLink = (t) => `#/title/${encodeURIComponent(t.id)}`;

function when(ts) {
  const d = new Date(ts), mins = (Date.now() - d) / 60000;
  if (mins < 60) return `${Math.max(1, Math.round(mins))}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  if (mins < 60 * 24 * 6) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
  feedType: 'all', feedSvc: 'all', listSvc: 'all', listType: 'all', feedSort: 'review', listSort: 'added', feedPeople: 'all',
  following: new Set(),   // ids you follow
  followsReady: false,    // false until the follows table exists (migration 005)
  qp: null,               // quick-pick round in progress
};

const isMe = (id) => id === state.me?.id;
const nameOf = (id) => isMe(id) ? 'You' : (state.people.get(id)?.name || 'Someone');

// Other people's rows carry only their name and photo; your own settings come from my_settings().
async function loadPeople() {
  const { data } = await sb.from('profiles').select('id, name, avatar_url, is_host, onboarded');
  state.people = new Map((data ?? []).map((p) => [p.id, p]));
  state.me = state.people.get(state.session.user.id) ?? null;
  if (!state.me) return;
  const { data: mine, error } = await sb.rpc('my_settings');
  if (!error && mine?.[0]) Object.assign(state.me, mine[0]);
  else { // database not updated yet: older rules, read your own row directly
    const { data: row } = await sb.from('profiles').select('services, weekly_email').eq('id', state.me.id).single();
    Object.assign(state.me, row ?? {}, { is_member: true });
  }
  const { data: fl, error: fe } = await sb.from('follows').select('followee');
  state.followsReady = !fe;
  state.following = new Set((fl ?? []).map((f) => f.followee));
}

async function loadProviders(ids) {
  const missing = [...new Set(ids)].filter((id) => !state.providers.has(id));
  for (let i = 0; i < missing.length; i += 60) {
    try {
      const { providers } = await fn('providers', { ids: missing.slice(i, i + 60) });
      for (const [id, p] of Object.entries(providers)) state.providers.set(id, p);
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
    return `<span class="watch ${mine.length ? 'mine' : ''}">Watch on <strong>${names}${mine.length ? ' · yours' : ''}</strong></span>`;
  }
  if (p.rent?.length || p.buy?.length) return '<span class="watch muted">Rent or buy only</span>';
  return '<span class="watch muted">Not streaming in the US</span>';
}

// ---------------------------------------------------------------- router

const routes = {
  feed: viewFeed, title: viewTitle, add: viewAdd, quickpick: viewQuickpick,
  list: viewList, me: viewMe, friend: viewFriend, welcome: viewWelcome, about: viewAbout, following: viewFollowing, passkey: viewPasskey, help: viewHelp,
};

async function route() {
  if (/error_description/.test(location.hash)) {
    history.replaceState(null, '', location.pathname);
    toast('That sign-in link expired. Use the 6-digit code instead.');
  }
  if (!state.session) { $nav.hidden = true; return location.hash.startsWith('#/help') ? viewHelp() : viewSignIn(); }
  if (!state.me) await loadPeople();
  if (!state.me) { $app.innerHTML = '<p class="empty">Setting up your profile… refresh in a moment.</p>'; return; }

  if (/access_token|error_description/.test(location.hash)) return;
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  let view = routes[name] ? name : 'feed';
  if (state.me.is_member === false) { $nav.hidden = true; return viewNotMember(); }
  if (!state.me.onboarded && view !== 'quickpick' && view !== 'about' && view !== 'passkey' && view !== 'help') view = 'welcome';

  $nav.hidden = view === 'welcome';
  for (const a of $nav.querySelectorAll('a')) a.classList.toggle('on', a.dataset.tab === view);
  window.scrollTo(0, 0);
  try { await routes[view](...rest.map(decodeURIComponent)); }
  catch (e) { console.error(e); $app.innerHTML = '<p class="empty">Couldn’t load this. Pull to refresh or try again.</p>'; }
  updateActivityDot();
}
window.addEventListener('hashchange', route);

async function updateActivityDot() {
  const { count } = await sb.from('activity').select('id', { count: 'exact', head: true }).is('read_at', null);
  const me = $nav.querySelector('[data-tab=me]');
  me.querySelector('.dot')?.remove();
  if (count) me.insertAdjacentHTML('beforeend', '<span class="dot" aria-label="new activity"></span>');
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
      ${offerFace ? `<button class="primary big face" data-act="passkeySignIn">${FACE_ICON} Sign in with ${bioName()}</button>
      <p class="muted small" id="passkeyMsg" role="status"></p>
      <div class="or"><span>or get a code by email</span></div>` : ''}
      <form id="f" class="field">
        <label for="email">Your email</label>
        <input id="email" type="email" autocomplete="email" required value="${esc(email)}">
        <button class="${offerFace ? '' : 'primary '}big" type="submit">${offerFace ? 'Email me a code' : 'Send me a code'}</button>
      </form>
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
      <p class="muted">We emailed a 6-digit code to ${esc(email)}. It can take a minute to arrive; check spam if you don’t see it.</p>
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
const HELP_EMAIL = ''; // shown as "Still stuck? Email …" when set
const HELP = [
  ['Getting in', [
    ['How do I sign in?', 'Type your email and tap <b>Email me a code</b>. Open the email from TV and type the 6-digit code. On iPhone, the code often appears above the keyboard so you can tap it instead.'],
    ['How do I sign in with Face ID?', 'After you sign in with a code, TV Rex asks if you’d like to use Face ID. Tap <b>Yes</b>. Missed it? Go to <b>Me</b> and tap <b>Turn on</b> next to Sign in with Face ID. Next time, tap <b>Sign in with Face ID</b> and look at your phone.'],
    ['Why do I have to sign in again?', 'Safari forgets sign-ins for websites you haven’t opened in a week. Turn on Face ID and signing back in takes one look.'],
    ['My invite link says it’s used or expired', 'Each invite link works once, for one person, for 7 days. Ask the person who invited you for a new link.'],
  ]],
  ['Using TV Rex', [
    ['How do I add something I watched?', 'Tap <b>Add</b> at the bottom. Type the name, tap the right show or movie, pick a rating, and add a note if you like.'],
    ['What do the ratings mean?', '<b>Loved</b> and <b>Liked</b> show up in everyone’s feed. <b>Didn’t like</b> and <b>Gave up</b> only show next to other people’s reviews of the same title, so they never start a new card.'],
    ['Where can I watch it?', 'Look for <b>Watch on</b> on each card. Services you’ve picked in <b>Me</b> are marked “yours.” Streaming info is from JustWatch, for the US.'],
    ['How do I save something for later?', 'Tap <b>+ Want to watch</b>. It goes to <b>My list</b> at the bottom of the screen.'],
    ['What does “Seen it” do?', 'It lets you rate a title right from the card, without opening it.'],
    ['How do I change or remove my review?', 'Open the show or movie and tap <b>Edit</b> next to your rating.'],
  ]],
  ['People', [
    ['How do I follow someone?', 'Tap their name on any review, then tap <b>+ Follow</b>.'],
    ['Everyone or Following?', '<b>Everyone</b> shows picks from everyone on TV Rex. <b>Following</b> shows only people you follow, plus your own.'],
    ['How do I invite someone?', 'Go to <b>Me</b>, tap <b>Invite someone</b>, then <b>Send link</b>. Each link is for one person only. For another person, tap <b>New link</b>.'],
    ['Who can see my picks?', 'Everyone who joined TV Rex by invite can see your name and reviews. Your email, your streaming services and My list stay private.'],
  ]],
  ['Tips', [
    ['How do I put TV Rex on my Home Screen?', 'In Safari, tap the Share button, then <b>Add to Home Screen</b>, then <b>Add</b>. Open TV Rex from the new icon and sign in once.'],
    ['How do I make the text bigger?', 'TV Rex follows your iPhone or iPad text size: <b>Settings › Display &amp; Brightness › Text Size</b>. In Safari you can also tap <b>aA</b> in the address bar and tap the larger A.'],
  ]],
];
function viewHelp() {
  $app.innerHTML = `
    <a href="${state.session ? 'javascript:history.back()' : '#/'}">← Back</a>
    <h1>Help</h1>
    ${HELP.map(([group, qs], gi) => `<h2 class="help-group">${group}</h2>
      <div class="list faq">${qs.map(([q, a], qi) => `<details${!state.session && gi === 0 && qi === 0 ? ' open' : ''}><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`).join('')}
    ${HELP_EMAIL ? `<p class="muted">Still stuck? Email <a href="mailto:${HELP_EMAIL}">${HELP_EMAIL}</a>.</p>` : ''}`;
}

// ---------------------------------------------------------------- not a member
// Signed in without an invite: the database shows them nothing, so say why.
function viewNotMember() {
  const why = { used: 'That invite link has already been used. Each link works for one person.',
    expired: 'That invite link has expired. Links work for 7 days.',
    invalid: 'That invite link doesn’t work.' }[state.inviteProblem];
  $app.innerHTML = `${BRAND}
    <h2>TV Rex is invite-only</h2>
    ${why ? `<p><strong>${why}</strong></p>` : ''}
    <p>Ask the person who told you about TV Rex to send you a new invite link, then open it on this device.</p>
    <button class="big" data-act="signOut">Sign out</button>`;
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
    <p class="muted">Tip: on iPhone or iPad, tap Share → Add to Home Screen to keep TV Rex one tap away.</p>`;
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

async function viewFeed() {
  const { data: rows } = await sb.from('ratings')
    .select('user_id, title_id, rating, note, season, source, activity_at, titles(id, name, year, media_type, poster_path)')
    .order('activity_at', { ascending: false }).limit(400);

  // Quick-pick ratings without a note become one summary line per person.
  const isQuiet = (r) => r.source === 'quickpick' && !r.note;
  const weekAgo = Date.now() - 7 * 864e5;
  const summary = new Map();
  for (const r of rows ?? []) if (isQuiet(r) && !isMe(r.user_id) && Date.parse(r.activity_at) > weekAgo && (state.feedPeople !== 'following' || state.following.has(r.user_id)))
    summary.set(r.user_id, (summary.get(r.user_id) ?? 0) + 1);

  // Following: only reviews by people you follow (and your own).
  const following = state.followsReady && state.feedPeople === 'following';
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
  await loadProviders(list.map((c) => c.title.id));
  // Only titles you can stream right now (if streaming info didn't load, keep the card).
  list = list.filter((c) => !state.providers.has(c.title.id) || subs(c.title.id).length);
  if (state.feedSvc === 'mine') list = list.filter((c) => onMyServices(c.title.id));
  if (state.feedSort === 'release') list.sort((a, b) => (b.title.year ?? 0) - (a.title.year ?? 0)); // same year keeps review order

  const { data: wl } = await sb.from('watchlist').select('title_id').is('watched_at', null);
  const saved = new Set((wl ?? []).map((w) => w.title_id));

  $app.innerHTML = `
    ${BRAND}
    ${state.followsReady ? `<div class="tabs" role="tablist" aria-label="Whose picks">
      ${[['all', 'Everyone'], ['following', 'Following']].map(([v, l]) => `<button role="tab" class="${state.feedPeople === v ? 'on' : ''}" aria-selected="${state.feedPeople === v}" data-act="feedPeople" data-val="${v}">${l}</button>`).join('')}</div>` : ''}
    ${filterBar('feed')}
    ${[...summary].map(([id, n]) => `<p class="muted"><a href="#/friend/${id}">${esc(nameOf(id))}</a> rated ${n} title${n > 1 ? 's' : ''} in quick-pick this week</p>`).join('')}
    ${list.length ? list.map((c) => feedCard(c, saved)).join('')
      : following && !state.following.size ? '<p class="empty">You’re not following anyone yet. In Everyone, tap a name on a review, then tap Follow.</p>'
      : `<p class="empty">No picks yet. ${state.people.size <= 1 ? 'Once others join, their picks show up here.' : 'Rate something to get things going.'}</p>`}`;
}
actions.feedPeople = (d) => { state.feedPeople = d.val; route(); };

// Filters: one "Showing … / Filter" line; the choices slide up in a panel.
const TYPE = ['Show', [['all', 'All'], ['tv', 'TV'], ['movie', 'Movies']]];
const FILTERS = {
  feed: [['feedType', ...TYPE], ['feedSvc', 'Services', [['all', 'All services'], ['mine', 'My services']]],
    ['feedSort', 'Sort by', [['review', 'Latest reviews'], ['release', 'Newest releases']]]],
  list: [['listSvc', 'Services', [['all', 'All services'], ['mine', 'On my services']]], ['listType', ...TYPE],
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
      ${groups.map(([key, label, opts]) => `<div class="field"><label>${label}</label><div class="seg" role="group" aria-label="${label}">
        ${opts.map(([v, l]) => `<button class="${state[key] === v ? 'on' : ''}" data-act="pickFilter" data-key="${key}" data-val="${v}" aria-pressed="${state[key] === v}">${l}</button>`).join('')}</div></div>`).join('')}
      <button class="primary big" data-act="closeFilters">Done</button>
    </div>`;
}
let filtersChanged = false;
actions.openFilters = () => { document.body.classList.add('sheet-open'); document.querySelector('.sheet')?.focus(); };
actions.pickFilter = (d, el) => {
  state[d.key] = d.val; filtersChanged = true;
  el.parentElement.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === el); b.setAttribute('aria-pressed', b === el); });
};
actions.closeFilters = () => {
  document.body.classList.remove('sheet-open');
  if (filtersChanged) { filtersChanged = false; route(); }
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('sheet-open')) actions.closeFilters(); });

function feedCard(c, saved) {
  const t = c.title, shown = c.reviews.slice(0, 2), more = c.reviews.length - shown.length;
  const mine = c.reviews.find((r) => isMe(r.user_id));
  return `<article class="card pick-card">
    <div class="pick">
      <a href="${titleLink(t)}">${poster(t.poster_path)}</a>
      <div class="pick-body">
        <a class="title" href="${titleLink(t)}">${esc(t.name)}</a>
        <span class="muted">${kind(t)}</span>
        ${watchOn(t.id)}
      </div>
    </div>
      ${shown.map((r) => reviewHtml(r, true)).join('')}
      ${more > 0 ? `<a class="small more" href="${titleLink(t)}">+${more} more</a>` : ''}
      <div class="row actions">
        ${mine ? `<span class="muted">You: <strong>${ratingLabel(mine)}</strong></span> <a class="small" href="${titleLink(t)}">Edit</a>`
          : `${saved.has(t.id) ? SAVED
              : `<button class="primary" data-act="save" data-id="${esc(t.id)}">+ Want to watch</button>`}
             <button data-act="seenIt" data-id="${esc(t.id)}">Seen it</button>`}
      </div>
    </article>`;
}

function reviewHtml(r, withThanks) {
  return `<div class="review">
    <div class="who">${personLink(r.user_id)} <span class="pill">${ratingLabel(r)}</span> <span class="when">${when(r.activity_at)}</span>
      ${withThanks && !isMe(r.user_id) && POSITIVE.includes(r.rating) ? `<button class="link small" data-act="thanks" data-user="${r.user_id}" data-id="${esc(r.title_id)}">Thanks</button>` : ''}</div>
    ${r.note ? `<div class="note">“${esc(r.note)}”</div>` : ''}</div>`;
}

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
};
actions.thanks = async (d, el) => {
  el.disabled = true;
  await sb.from('reactions').upsert({ from_user: state.me.id, to_user: d.user, title_id: d.id }, { ignoreDuplicates: true });
  el.outerHTML = '<span class="when">Thanked</span>';
};

// ---------------------------------------------------------------- title page

async function viewTitle(id) {
  const [{ data: t }, { data: rs }, { data: wl }] = await Promise.all([
    sb.from('titles').select('*').eq('id', id).single(),
    sb.from('ratings').select('user_id, title_id, rating, note, season, activity_at').eq('title_id', id).order('activity_at', { ascending: false }),
    sb.from('watchlist').select('title_id, watched_at').eq('title_id', id).maybeSingle(),
  ]);
  if (!t) { $app.innerHTML = '<p class="empty">Title not found.</p>'; return; }
  await loadProviders([id]);
  const p = state.providers.get(id) ?? {};
  const mine = (rs ?? []).find((r) => isMe(r.user_id));
  const others = (rs ?? []).filter((r) => !isMe(r.user_id));
  $app.innerHTML = `
    <a href="javascript:history.back()">← Back</a>
    <div class="pick">${poster(t.poster_path, 'lg')}
      <div class="pick-body"><h1>${esc(t.name)}</h1><span class="muted">${kind(t)}</span>
        ${mine ? '' : wl && !wl.watched_at ? SAVED : `<button class="primary" data-act="save" data-id="${esc(id)}">+ Want to watch</button>`}
      </div></div>
    <section class="card watchbox">
      <div class="muted small">WATCH ON</div>
      ${subs(id).length ? `<div class="row">${subs(id).map((s) => `<span class="chip ${isMine(s) ? 'on' : ''}" style="display:inline-flex;align-items:center">${esc(s.name)}${isMine(s) ? ' · yours' : ''}</span>`).join('')}</div>` : '<p>Not on a subscription service in the US right now.</p>'}
      ${p.rent?.length || p.buy?.length ? `<p class="muted">Rent or buy: ${esc([...new Set([...(p.rent ?? []), ...(p.buy ?? [])].map((s) => serviceName(s.name)))].slice(0, 4).join(', '))}</p>` : ''}
      <p class="credits">Streaming data from JustWatch</p>
    </section>
    <h2>Your rating</h2>
    ${mine ? `
      <div class="card" id="myReview">
        <div class="spread"><span><strong>${ratingLabel(mine)}</strong> <span class="muted">· ${when(mine.activity_at)}</span></span>
          <button class="link" data-act="editReview">Edit review</button></div>
        ${mine.note ? `<div class="note">“${esc(mine.note)}”</div>` : '<p class="muted">No note.</p>'}
      </div>
      <div id="reviewForm" hidden>
        ${ratingForm(mine, id, 'Save changes')}
        <div class="row"><button class="link" data-act="cancelEdit">Cancel</button>
          <button class="link danger" data-act="removeRating" data-id="${esc(id)}">Remove my rating</button></div>
      </div>` : ratingForm(null, id)}
    <h2>Reviews</h2>
    ${others.length ? `<div class="list">${others.map((r) => reviewHtml(r, true)).join('')}</div>` : '<p class="muted">No one else has rated this yet.</p>'}`;
}

function ratingForm(mine, titleId, saveLabel = 'Save') {
  return `<form class="field" data-title="${esc(titleId)}" id="rate">
    <div class="ratings">${Object.entries(RATING).map(([k, v]) =>
      `<button type="button" class="${mine?.rating === k ? 'on' : ''}" data-act="pickRating" data-val="${k}" aria-pressed="${mine?.rating === k}">${v}</button>`).join('')}</div>
    ${titleId.startsWith('tv:') ? `<label for="season">How far did you get?</label>
    <select id="season" class="season" data-title="${esc(titleId)}" data-current="${mine?.season ?? ''}"><option value="">Whole show</option></select>` : ''}
    <label for="note">One-line note (optional)</label>
    <input id="note" maxlength="200" value="${esc(mine?.note)}" placeholder="What should friends know?">
    <p class="muted">Loved and Liked put this in everyone’s feed. You can change your rating anytime.</p>
    <button class="primary big" type="button" data-act="saveRating">${saveLabel}</button></form>`;
}
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
  let { error } = await sb.from('ratings').upsert(row);
  if (error && /season/i.test(error.message)) { delete row.season; ({ error } = await sb.from('ratings').upsert(row)); } // before the seasons update is installed
  if (error) { el.disabled = false; throw error; }
  await sb.from('watchlist').update({ watched_at: new Date().toISOString() }).eq('title_id', titleId).is('watched_at', null);
  toast('Saved');
  if (form.dataset.after && form.dataset.after !== location.hash) location.hash = form.dataset.after; else route();
};

// ---------------------------------------------------------------- add

let searchTimer;
const searchCache = new Map();
async function ensureTitle(id) {
  const { data } = await sb.from('titles').select('*').eq('id', id).maybeSingle();
  if (data) return data;
  const t = searchCache.get(id);
  if (!t) return null;
  await sb.from('titles').insert(t);
  return t;
}
async function viewAdd() {
  $app.innerHTML = `
    <h1>Add a title</h1>
    <div class="field"><label for="q">Search TV and movies</label>
      <input id="q" type="search" autocomplete="off" placeholder="e.g. Slow Horses"></div>
    <div id="results"></div>`;
  const q = document.getElementById('q');
  q.focus();
  q.oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const box = document.getElementById('results');
      if (q.value.trim().length < 2) { box.innerHTML = ''; return; }
      const { results } = await fn('search', { q: q.value });
      for (const t of results) searchCache.set(t.id, t);
      box.innerHTML = results.length ? `<div class="list">${results.map((t) =>
        `<a class="item" href="#/rate/${encodeURIComponent(t.id)}" data-act="chooseTitle" data-id="${esc(t.id)}">
          <span class="row">${poster(t.poster_path, 'sm')}<span><strong>${esc(t.name)}</strong><br><span class="muted">${kind(t)}</span></span></span><span class="muted">›</span></a>`).join('')}</div>`
        : '<p class="muted">No matches. Try another spelling.</p>';
    }, 300);
  };
}
actions.chooseTitle = async (d) => {
  const t = await ensureTitle(d.id);
  if (!t) return toast('Couldn’t load that title. Try again.');
  const { data: mine } = await sb.from('ratings').select('rating, note, season').eq('title_id', d.id).eq('user_id', state.me.id).maybeSingle();
  await loadProviders([d.id]);
  $app.innerHTML = `
    <button class="link" data-act="backToAdd">← Search again</button>
    <div class="pick">${poster(t.poster_path, 'lg')}<div class="pick-body"><h1>${esc(t.name)}</h1><span class="muted">${kind(t)}</span>${watchOn(t.id)}</div></div>
    <h2>How was it?</h2>
    ${mine ? '<p class="muted">You’ve rated this already. Change it below.</p>' : ''}
    ${ratingForm(mine, d.id, mine ? 'Save changes' : 'Save').replace('<form ', `<form data-after="#/title/${encodeURIComponent(d.id)}" `)}`;
};
actions.backToAdd = () => viewAdd();

// ---------------------------------------------------------------- quick-pick

async function buildRound() {
  const [{ data: mineR }, { data: skips }, { data: friendR }] = await Promise.all([
    sb.from('ratings').select('title_id').eq('user_id', state.me.id),
    sb.from('quickpick_skips').select('title_id'),
    sb.from('ratings').select('user_id, title_id, rating, titles(*)').neq('user_id', state.me.id).in('rating', POSITIVE).order('activity_at', { ascending: false }).limit(200),
  ]);
  const done = new Set([...(mineR ?? []), ...(skips ?? [])].map((r) => r.title_id));
  const lovedBy = new Map();
  for (const r of friendR ?? []) if (!lovedBy.has(r.title_id)) lovedBy.set(r.title_id, r);

  // Friends' titles first (streaming only), then current popular + classics.
  const friendTitles = [...lovedBy.values()].map((r) => r.titles).filter((t) => t && !done.has(t.id));
  await loadProviders(friendTitles.map((t) => t.id));
  const cards = friendTitles.filter((t) => state.providers.get(t.id)?.flatrate?.length);

  if (!state.services) state.services = (await fn('services')).services;
  const svc = myServices().length ? myServices() : state.services.slice(0, 12).flatMap((s) => s.ids);
  for (let page = state.qp?.page ?? 1; cards.length < ROUND && page < 6; page++) {
    const { now, classic } = await fn('discover', { providers: svc, page });
    const mix = [];
    for (let i = 0; mix.length < 30 && (i < now.length || i < classic.length); i++) {
      if (now[i * 2]) mix.push(now[i * 2]);
      if (now[i * 2 + 1]) mix.push(now[i * 2 + 1]);
      if (classic[i]) mix.push(classic[i]);
    }
    for (const t of mix) if (!done.has(t.id) && !cards.some((c) => c.id === t.id)) cards.push(t);
    state.qp = { ...(state.qp ?? {}), page: page + 1 };
  }
  const round = cards.slice(0, ROUND);
  await loadProviders(round.map((t) => t.id));
  state.qp = { ...state.qp, cards: round, i: 0, lovedBy };
}

async function viewQuickpick() {
  if (!state.qp?.cards || state.qp.i >= state.qp.cards.length) {
    if (state.qp?.cards && state.qp.i >= state.qp.cards.length) return roundDone();
    $app.innerHTML = '<p class="loading">Finding titles…</p>';
    await buildRound();
  }
  const { cards, i, lovedBy } = state.qp;
  if (!cards.length) return roundDone();
  const t = cards[i], friend = lovedBy.get(t.id);
  $app.innerHTML = `
    <div class="spread"><h1>Quick-pick</h1><span class="muted">${i + 1} of ${cards.length}</span></div>
    <div class="progress"><div style="width:${(i / cards.length) * 100}%"></div></div>
    <div class="card qp-card">
      ${poster(t.poster_path, 'xl')}
      <div class="title">${esc(t.name)}</div>
      <span class="muted">${kind(t)}</span>
      ${watchOn(t.id)}
      ${friend ? `<span class="muted">${RATING[friend.rating]} by ${esc(nameOf(friend.user_id))}</span>` : ''}
    </div>
    <div class="ratings">${Object.entries(RATING).map(([k, v]) => `<button data-act="qpRate" data-val="${k}">${v}</button>`).join('')}</div>
    <button class="big" data-act="qpSkip">Haven’t seen it</button>
    ${friend ? `<button class="link" data-act="qpSave">+ Want to watch instead</button>` : ''}`;
}
actions.qpRate = async (d) => {
  const t = state.qp.cards[state.qp.i];
  await sb.from('ratings').upsert({ user_id: state.me.id, title_id: t.id, rating: d.val, source: 'quickpick' });
  state.qp.i++; viewQuickpick();
};
actions.qpSkip = async () => {
  const t = state.qp.cards[state.qp.i];
  await sb.from('quickpick_skips').upsert({ user_id: state.me.id, title_id: t.id }, { ignoreDuplicates: true });
  state.qp.i++; viewQuickpick();
};
actions.qpSave = async () => {
  const t = state.qp.cards[state.qp.i], f = state.qp.lovedBy.get(t.id);
  await sb.from('quickpick_skips').upsert({ user_id: state.me.id, title_id: t.id }, { ignoreDuplicates: true });
  await sb.from('watchlist').upsert({ user_id: state.me.id, title_id: t.id, watched_at: null });
  if (f) await sb.from('watchlist_credits').upsert({ user_id: state.me.id, title_id: t.id, recommender_id: f.user_id }, { ignoreDuplicates: true });
  toast('Saved to your list');
  state.qp.i++; viewQuickpick();
};

async function roundDone() {
  if (!state.me.onboarded) {
    await sb.from('profiles').update({ onboarded: true }).eq('id', state.me.id);
    state.me.onboarded = true;
  }
  $app.innerHTML = `
    <h1>Round done</h1>
    <p class="muted">Your ratings help match you with friends. Add a note on any title to share it in friends’ feeds.</p>
    <button class="primary big" data-act="qpMore">Keep going</button>
    <a class="btn big" href="#/feed">Go to the feed</a>`;
}
actions.qpMore = () => { state.qp = { page: state.qp?.page }; viewQuickpick(); };

// ---------------------------------------------------------------- want to watch

async function viewList() {
  const { data: rows } = await sb.from('watchlist')
    .select('title_id, added_at, titles(*), watchlist_credits(recommender_id)')
    .is('watched_at', null).order('added_at', { ascending: false });
  let items = rows ?? [];
  await loadProviders(items.map((r) => r.title_id));
  if (state.listType !== 'all') items = items.filter((r) => r.titles.media_type === state.listType);
  if (state.listSvc === 'mine') items = items.filter((r) => onMyServices(r.title_id));
  if (state.listSort === 'release') items.sort((a, b) => (b.titles.year ?? 0) - (a.titles.year ?? 0));
  $app.innerHTML = `
    <h1>Want to watch</h1>
    ${filterBar('list')}
    ${items.length ? items.map((r) => {
      const from = r.watchlist_credits.map((c) => personLink(c.recommender_id));
      return `<div class="card pick">
        <a href="${titleLink(r.titles)}">${poster(r.titles.poster_path, 'sm')}</a>
        <div class="pick-body"><a class="title" href="${titleLink(r.titles)}">${esc(r.titles.name)}</a>
          <span class="muted">${from.length ? 'from ' + from.join(', ') : 'added by you'}</span>
          ${watchOn(r.title_id)}</div>
        <button data-act="watched" data-id="${esc(r.title_id)}">Watched</button></div>`;
    }).join('') : `<p class="empty">${state.listSvc === 'mine' && (rows ?? []).length ? 'Nothing on your services. Try “All”.' : 'Nothing saved yet. Tap “+ Want to watch” on a friend’s pick.'}</p>`}`;
}
actions.watched = async (d) => {
  const { data: t } = await sb.from('titles').select('*').eq('id', d.id).single();
  $app.innerHTML = `
    <a href="#/list">← Back</a>
    <div class="pick">${poster(t.poster_path, 'lg')}<div class="pick-body"><h1>How was ${esc(t.name)}?</h1></div></div>
    ${ratingForm(null, d.id).replace('<form ', '<form data-after="#/list" data-source="watchlist" ')}`;
};

// ---------------------------------------------------------------- me

async function viewMe() {
  await loadPeople();
  if (!state.services) state.services = (await fn('services')).services;
  const [{ data: acts }, { count: nRatings }, { data: myRecent }, { error: invitesClosed }, { data: keys, error: keysErr }] = await Promise.all([
    sb.from('activity').select('*, titles(name)').order('created_at', { ascending: false }).limit(20),
    sb.from('ratings').select('title_id', { count: 'exact', head: true }).eq('user_id', state.me.id),
    sb.from('ratings').select('rating, title_id, titles(id, name, media_type)').eq('user_id', state.me.id).order('activity_at', { ascending: false }).limit(5),
    sb.rpc('my_open_invites'), // missing until migration 006: then only hosts invite
    canPasskey() ? sb.auth.passkey.list() : Promise.resolve({ error: true }),
  ]);
  const faceOn = !keysErr && Array.isArray(keys) && keys.length > 0;
  const canInvite = invitesClosed ? state.me.is_host : true;
  const actText = { loved_your_pick: 'loved your pick', liked_your_pick: 'liked your pick', thanks: 'said thanks for', joined: 'joined from your invite' };
  $app.innerHTML = `
    <div><h1>${esc(state.me.name)}</h1><span class="muted">${nRatings ?? 0} rating${nRatings === 1 ? '' : 's'}</span></div>
    <div class="field"><label for="myName">Your name, as others see it</label>
      <div class="row" style="flex-wrap:nowrap"><input id="myName" style="flex:1;min-width:0" value="${esc(state.me.name)}" autocomplete="given-name">
      <button class="primary" data-act="saveName">Save</button></div></div>
    <h2>Activity</h2>
    ${acts?.length ? `<div class="list">${acts.map((a) => `<div class="${a.read_at ? '' : 'unread'}">
      ${personLink(a.actor_id)} ${actText[a.kind]} ${a.titles ? `<a href="#/title/${encodeURIComponent(a.title_id)}">${esc(a.titles.name)}</a>` : ''} <span class="muted">· ${when(a.created_at)}</span></div>`).join('')}</div>`
      : '<p class="muted">Nothing yet. When people save or thank your picks, it shows here.</p>'}
    <h2>My services</h2>
    <p class="muted">Used for the My services filter and highlights.</p>
    <div class="row" id="svc">${serviceChips('toggleMySvc')}</div>
    ${canInvite ? '<div class="spread"><h2>Invite</h2><button class="primary" data-act="invite">Invite someone</button></div>' : ''}
    <div id="inviteBox"></div>
    ${keysErr ? '' : `<div class="list"><div class="item"><span><strong>Sign in with ${bioName()}</strong> <span class="muted">· ${faceOn ? 'On' : 'Off'}</span></span>
      ${faceOn ? '' : `<button data-act="addPasskey">Turn on</button>`}</div></div>`}
    ${state.followsReady ? `<div class="list"><a class="item" href="#/following"><span><strong>Following</strong> <span class="muted">· ${state.following.size} ${state.following.size === 1 ? 'person' : 'people'}</span></span><span class="muted">›</span></a></div>` : ''}
    <div class="spread"><h2>My picks</h2><a class="small" href="#/friend/${state.me.id}">See all</a></div>
    ${myRecent?.length ? `<div class="list">${myRecent.map((r) => `<a class="item" href="${titleLink(r.titles)}"><span><strong>${esc(r.titles.name)}</strong> <span class="muted">· ${RATING[r.rating]}</span></span><span class="muted">›</span></a>`).join('')}</div>`
      : '<p class="muted">Nothing rated yet. Tap Add to rate a show.</p>'}
    <div class="list">
      <div class="spread"><span>Weekly email (Sundays)</span><button class="chip ${state.me.weekly_email ? 'on' : ''}" data-act="toggleEmail">${state.me.weekly_email ? 'On' : 'Off'}</button></div>
      <a class="item" href="#/help"><span>Help</span><span class="muted">›</span></a>
      <a class="item" href="#/about"><span>About and credits</span><span class="muted">›</span></a>
      <button class="link" data-act="signOut">Sign out</button>
      <button class="link danger" data-act="deleteAccount">Delete my account</button>
    </div>`;
  await sb.from('activity').update({ read_at: new Date().toISOString() }).is('read_at', null);
}
actions.toggleMySvc = async (d, el) => {
  actions.toggleSvc(d, el);
  const services = chosenServiceIds();
  await sb.from('profiles').update({ services }).eq('id', state.me.id);
  state.me.services = services;
};
actions.toggleEmail = async (d, el) => {
  state.me.weekly_email = !state.me.weekly_email;
  await sb.from('profiles').update({ weekly_email: state.me.weekly_email }).eq('id', state.me.id);
  el.textContent = state.me.weekly_email ? 'On' : 'Off'; el.classList.toggle('on', state.me.weekly_email);
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
actions.invite = async () => {
  const { data, error } = await sb.from('invites').insert({ created_by: state.me.id }).select('code').single();
  if (error) return toast('Couldn’t make a link. You can have up to 10 unused links at a time.');
  const url = `${location.origin}${location.pathname}?invite=${data.code}`;
  state.invitesMade = (state.invitesMade ?? 0) + 1;
  document.getElementById('inviteBox').innerHTML = `<div class="card field">
    ${state.invitesMade > 1 ? '<p class="muted small">New link ready.</p>' : ''}
    <p><strong>For one person only.</strong> The link works once, for 7 days.</p>
    <input readonly value="${esc(url)}" id="inviteUrl" aria-label="Invite link">
    <button class="primary big" data-act="shareInvite">Send link</button>
    <button class="big" data-act="invite">New link</button></div>`;
};
actions.shareInvite = async () => {
  const url = document.getElementById('inviteUrl').value;
  // The phone or computer's share menu where there is one; otherwise copy the link.
  if (navigator.share) await navigator.share({ title: 'Let’s share what we’re watching on TV Rex', text: 'Let’s share what we’re watching on TV Rex:', url }).catch(() => {});
  else await actions.copyInvite();
};
actions.copyInvite = async () => { await navigator.clipboard.writeText(document.getElementById('inviteUrl').value); toast('Link copied'); };
actions.signOut = async () => { localStorage.removeItem('tv_invite'); await sb.auth.signOut(); };
actions.deleteAccount = async () => {
  if (!confirm('Delete your account and all your ratings? This can’t be undone.')) return;
  await sb.rpc('delete_my_account');
  await sb.auth.signOut();
};

function viewAbout() {
  $app.innerHTML = `
    <a href="#/me">← Back</a>
    <h1>About TV Rex</h1>
    <p>A private place for friends and family to share what they’re watching.</p>
    <p class="credits">This product uses the TMDB API but is not endorsed or certified by TMDB. Title data and images from <a href="https://www.themoviedb.org">TMDB</a>. Streaming data from <a href="https://www.justwatch.com">JustWatch</a>.</p>`;
}

// ---------------------------------------------------------------- friend profile

async function viewFriend(id, filter) {
  await loadPeople();
  const p = state.people.get(id);
  if (!p) { $app.innerHTML = '<p class="empty">Not found.</p>'; return; }
  const { data: rs } = await sb.from('ratings').select('user_id, title_id, rating, note, season, activity_at, titles(*)').eq('user_id', id).order('activity_at', { ascending: false });
  const [{ data: wl }, { data: myR }] = await Promise.all([
    sb.from('watchlist').select('title_id').is('watched_at', null),
    sb.from('ratings').select('title_id, rating, season').eq('user_id', state.me.id),
  ]);
  const saved = new Set((wl ?? []).map((w) => w.title_id));
  const myRating = new Map((myR ?? []).map((r) => [r.title_id, r]));
  const count = (k) => (rs ?? []).filter((r) => r.rating === k).length;
  const tabs = POSITIVE.filter((k) => count(k)); // Loved and Liked show only if not empty
  if (filter !== 'all' && !tabs.includes(filter)) filter = tabs[0] ?? 'all';
  const shown = (rs ?? []).filter((r) => filter === 'all' || r.rating === filter);
  const segBtn = (val, label) => `<button class="${filter === val ? 'on' : ''}" data-act="friendFilter" data-id="${id}" data-val="${val}" aria-pressed="${filter === val}">${label}</button>`;
  await loadProviders(shown.map((r) => r.title_id));
  $app.innerHTML = `
    <a href="javascript:history.back()">← Back</a>
    <div class="spread"><div><h1>${esc(isMe(id) ? 'My picks' : p.name)}</h1>
      <span class="muted">${(rs ?? []).length} rating${(rs ?? []).length === 1 ? '' : 's'}</span></div>
      ${!isMe(id) && state.followsReady ? followButton(id) : ''}</div>
    ${tabs.length ? `<div class="seg" role="group" aria-label="Rating">${tabs.map((k) => segBtn(k, RATING[k])).join('')}${segBtn('all', 'All')}</div>` : ''}
    ${shown.length ? shown.map((r) => `<div class="card pick-card"><div class="pick">
      <a href="${titleLink(r.titles)}">${poster(r.titles.poster_path, 'sm')}</a>
      <div class="pick-body"><a class="title" href="${titleLink(r.titles)}">${esc(r.titles.name)}</a>
        <span class="muted">${filter === 'all' ? ratingLabel(r) + ' · ' : ''}${kind(r.titles)}${filter !== 'all' && r.season ? ' · S' + r.season : ''}</span>${watchOn(r.title_id)}
        ${r.note ? `<div class="note">“${esc(r.note)}”</div>` : ''}</div></div>
      ${isMe(id) ? '' : `<div class="row actions">${myRating.has(r.title_id) ? `<span class="muted">You: <strong>${ratingLabel(myRating.get(r.title_id))}</strong></span>`
        : saved.has(r.title_id) ? SAVED
        : `<button class="primary" data-act="save" data-id="${esc(r.title_id)}">+ Want to watch</button>`}
        ${myRating.has(r.title_id) ? '' : `<button data-act="seenIt" data-id="${esc(r.title_id)}">Seen it</button>`}</div>`}</div>`).join('')
      : `<p class="empty">${filter === 'all' ? 'Nothing rated yet.' : `No ${RATING[filter]} titles yet.`}</p>`}`;
}
actions.friendFilter = (d) => viewFriend(d.id, d.val);

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
      if (event === 'SIGNED_IN') return signedIn();
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
