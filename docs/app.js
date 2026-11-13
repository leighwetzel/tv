import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

// ---------------------------------------------------------------- helpers

const $app = document.getElementById('app');
const $nav = document.getElementById('nav');
const IMG = 'https://image.tmdb.org/t/p/';
const RATING = { loved: 'Loved', liked: 'Liked', didnt_like: "Didn't like", gave_up: 'Gave up' };
const POSITIVE = ['loved', 'liked'];
const ROUND = 15;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const poster = (path, cls = '') => path
  ? `<img class="poster ${cls}" src="${IMG}${cls === 'xl' || cls === 'lg' ? 'w342' : 'w185'}${esc(path)}" alt="" loading="lazy">`
  : `<div class="poster ${cls}" aria-hidden="true"></div>`;
const kind = (t) => `${t.media_type === 'tv' ? 'TV' : 'Movie'}${t.year ? ' · ' + t.year : ''}`;
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

// ---------------------------------------------------------------- state

const state = {
  session: null,
  me: null,               // my profile row
  people: new Map(),      // id -> profile (me + connections)
  providers: new Map(),   // title id -> { flatrate, rent, buy }
  services: null,         // streaming service list from TMDB
  feedType: 'all', feedSvc: 'all', listSvc: 'mine', listType: 'all',
  qp: null,               // quick-pick round in progress
};

const isMe = (id) => id === state.me?.id;
const nameOf = (id) => isMe(id) ? 'You' : (state.people.get(id)?.name || 'Friend');

async function loadPeople() {
  const { data } = await sb.from('profiles').select('id, name, avatar_url, services, is_host, weekly_email, onboarded');
  state.people = new Map((data ?? []).map((p) => [p.id, p]));
  state.me = state.people.get(state.session.user.id) ?? null;
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
function onMyServices(id) {
  const p = state.providers.get(id);
  return !!p?.flatrate?.some((s) => myServices().includes(s.id));
}
function watchOn(id) {
  const p = state.providers.get(id);
  if (!p) return '';
  if (p.flatrate?.length) {
    const mine = p.flatrate.filter((s) => myServices().includes(s.id));
    const names = (mine.length ? mine : p.flatrate).slice(0, 2).map((s) => esc(s.name)).join(', ');
    return `<span class="watch ${mine.length ? 'mine' : ''}">Watch on <strong>${names}</strong>${mine.length ? ' · yours' : ''}</span>`;
  }
  if (p.rent?.length || p.buy?.length) return '<span class="watch muted">Rent or buy only</span>';
  return '<span class="watch muted">Not streaming in the US</span>';
}

// ---------------------------------------------------------------- router

const routes = {
  feed: viewFeed, title: viewTitle, add: viewAdd, quickpick: viewQuickpick,
  list: viewList, me: viewMe, friend: viewFriend, welcome: viewWelcome, about: viewAbout,
};

async function route() {
  if (!state.session) { $nav.hidden = true; return viewSignIn(); }
  if (!state.me) await loadPeople();
  if (!state.me) { $app.innerHTML = '<p class="empty">Setting up your profile… refresh in a moment.</p>'; return; }

  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  let view = routes[name] ? name : 'feed';
  if (!state.me.onboarded && view !== 'quickpick' && view !== 'about') view = 'welcome';

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
  me.innerHTML = 'Me' + (count ? '<span class="dot" aria-label="new activity"></span>' : '');
}

// ---------------------------------------------------------------- sign in

function viewSignIn(step = 'email', email = '') {
  if (step === 'email') {
    $app.innerHTML = `
      <h1>tv</h1>
      <p class="muted">TV and movie picks from your friends and family.</p>
      <form id="f" class="field">
        <label for="email">Your email</label>
        <input id="email" type="email" autocomplete="email" required value="${esc(email)}">
        <button class="primary big" type="submit">Send me a code</button>
      </form>`;
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
      <p class="muted">We sent a 6-digit code to ${esc(email)}.</p>
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
      const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
      if (error) { btn.disabled = false; return toast('That code didn’t work. Check it and try again.'); }
    };
  }
}
actions.restart = () => viewSignIn('email');

async function redeemPendingInvite() {
  const code = localStorage.getItem('tv_invite');
  if (!code) return;
  const { data } = await sb.rpc('redeem_invite', { invite_code: code });
  localStorage.removeItem('tv_invite');
  if (data) state.me = null; // reload connections
}

// ---------------------------------------------------------------- welcome

async function viewWelcome() {
  if (!state.services) state.services = (await fn('services')).services;
  const hosts = [...state.people.values()].filter((p) => p.is_host && !isMe(p.id)).map((p) => esc(p.name));
  const chosen = new Set(myServices());
  $app.innerHTML = `
    <div class="progress"><div style="width:50%"></div></div>
    <h1>Welcome to tv</h1>
    ${hosts.length ? `<p class="muted">You’re connected with ${hosts.join(' and ')}, and you’ll see their picks.</p>` : ''}
    <div class="field"><label for="name">Your name, as friends see it</label>
      <input id="name" value="${esc(state.me.name)}" autocomplete="given-name"></div>
    <h2>Which streaming services do you have?</h2>
    <div class="row" id="svc">${state.services.slice(0, 16).map((s) =>
      `<button class="chip ${chosen.has(s.id) ? 'on' : ''}" data-act="toggleSvc" data-id="${s.id}" aria-pressed="${chosen.has(s.id)}">${esc(s.name)}</button>`).join('')}</div>
    <button class="primary big" data-act="finishWelcome">Next: rate a few titles</button>`;
}
actions.toggleSvc = (d, el) => { el.classList.toggle('on'); el.setAttribute('aria-pressed', el.classList.contains('on')); };
actions.finishWelcome = async () => {
  const name = document.getElementById('name').value.trim() || state.me.name;
  const services = [...document.querySelectorAll('#svc .chip.on')].map((b) => Number(b.dataset.id));
  await sb.from('profiles').update({ name, services }).eq('id', state.me.id);
  Object.assign(state.me, { name, services });
  state.qp = null;
  location.hash = '#/quickpick';
};

// ---------------------------------------------------------------- feed

async function viewFeed() {
  const { data: rows } = await sb.from('ratings')
    .select('user_id, title_id, rating, note, source, activity_at, titles(id, name, year, media_type, poster_path)')
    .order('activity_at', { ascending: false }).limit(400);

  // Quick-pick ratings without a note become one summary line per person.
  const isQuiet = (r) => r.source === 'quickpick' && !r.note;
  const weekAgo = Date.now() - 7 * 864e5;
  const summary = new Map();
  for (const r of rows ?? []) if (isQuiet(r) && !isMe(r.user_id) && Date.parse(r.activity_at) > weekAgo)
    summary.set(r.user_id, (summary.get(r.user_id) ?? 0) + 1);

  // One card per title, started by a friend's Loved or Liked.
  const cards = new Map();
  for (const r of rows ?? []) {
    if (isQuiet(r)) continue;
    if (!cards.has(r.title_id)) cards.set(r.title_id, { title: r.titles, reviews: [], started: false });
    const c = cards.get(r.title_id);
    c.reviews.push(r);
    if (!isMe(r.user_id) && POSITIVE.includes(r.rating)) c.started = true;
  }
  let list = [...cards.values()].filter((c) => c.started);
  if (state.feedType !== 'all') list = list.filter((c) => c.title.media_type === state.feedType);
  await loadProviders(list.map((c) => c.title.id));
  if (state.feedSvc === 'mine') list = list.filter((c) => onMyServices(c.title.id));

  const { data: wl } = await sb.from('watchlist').select('title_id').is('watched_at', null);
  const saved = new Set((wl ?? []).map((w) => w.title_id));

  $app.innerHTML = `
    <div class="spread"><h1>tv</h1></div>
    <div class="seg" role="group" aria-label="Type">
      ${seg('feedType', 'all', 'All')}${seg('feedType', 'tv', 'TV')}${seg('feedType', 'movie', 'Movies')}</div>
    <div class="seg" role="group" aria-label="Services">
      ${seg('feedSvc', 'all', 'All services')}${seg('feedSvc', 'mine', 'My services')}</div>
    ${[...summary].map(([id, n]) => `<p class="muted"><a href="#/friend/${id}">${esc(nameOf(id))}</a> rated ${n} title${n > 1 ? 's' : ''} in quick-pick this week</p>`).join('')}
    ${list.length ? list.map((c) => feedCard(c, saved)).join('') : `<p class="empty">No picks yet. ${state.people.size <= 1 ? 'Once friends join, their picks show up here.' : 'Rate something to get things going.'}</p>`}`;
}

const seg = (key, val, label) => `<button class="${state[key] === val ? 'on' : ''}" data-act="seg" data-key="${key}" data-val="${val}" aria-pressed="${state[key] === val}">${label}</button>`;
actions.seg = (d) => { state[d.key] = d.val; route(); };

function feedCard(c, saved) {
  const t = c.title, shown = c.reviews.slice(0, 2), more = c.reviews.length - shown.length;
  return `<article class="card pick">
    <a href="${titleLink(t)}">${poster(t.poster_path)}</a>
    <div class="pick-body">
      <a class="title" href="${titleLink(t)}">${esc(t.name)}</a>
      <span class="muted">${kind(t)}</span>
      ${watchOn(t.id)}
      ${shown.map((r) => reviewHtml(r, true)).join('')}
      ${more > 0 ? `<a class="small" href="${titleLink(t)}">+${more} more</a>` : ''}
      <div class="row" style="margin-top:4px">
        ${saved.has(t.id) ? '<span class="muted">On your list</span>'
          : `<button class="primary" data-act="save" data-id="${esc(t.id)}">+ Want to watch</button>`}
      </div>
    </div></article>`;
}

function reviewHtml(r, withThanks) {
  return `<div class="review">
    <div class="who"><strong>${esc(nameOf(r.user_id))}</strong> · ${RATING[r.rating]} · ${when(r.activity_at)}
      ${withThanks && !isMe(r.user_id) && POSITIVE.includes(r.rating) ? ` · <button class="link small" data-act="thanks" data-user="${r.user_id}" data-id="${esc(r.title_id)}">Thanks</button>` : ''}</div>
    ${r.note ? `<div class="note">“${esc(r.note)}”</div>` : ''}</div>`;
}

actions.save = async (d, el) => {
  el.disabled = true;
  const { data: rs } = await sb.from('ratings').select('user_id, rating').eq('title_id', d.id);
  const recs = (rs ?? []).filter((r) => !isMe(r.user_id) && POSITIVE.includes(r.rating)).map((r) => r.user_id);
  await sb.from('watchlist').upsert({ user_id: state.me.id, title_id: d.id, watched_at: null });
  if (recs.length) await sb.from('watchlist_credits').upsert(recs.map((rid) => ({ user_id: state.me.id, title_id: d.id, recommender_id: rid })));
  el.outerHTML = '<span class="muted">On your list</span>';
  toast('Saved to your list');
};
actions.thanks = async (d, el) => {
  el.disabled = true;
  await sb.from('reactions').upsert({ from_user: state.me.id, to_user: d.user, title_id: d.id });
  el.outerHTML = '<span>Thanked</span>';
};

// ---------------------------------------------------------------- title page

async function viewTitle(id) {
  const [{ data: t }, { data: rs }, { data: wl }] = await Promise.all([
    sb.from('titles').select('*').eq('id', id).single(),
    sb.from('ratings').select('user_id, title_id, rating, note, activity_at').eq('title_id', id).order('activity_at', { ascending: false }),
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
        ${wl && !wl.watched_at ? '<span class="muted">On your list</span>' : `<button class="primary" data-act="save" data-id="${esc(id)}">+ Want to watch</button>`}
      </div></div>
    <section class="card watchbox">
      <div class="muted small">WATCH ON</div>
      ${p.flatrate?.length ? `<div class="row">${p.flatrate.map((s) => `<span class="chip ${myServices().includes(s.id) ? 'on' : ''}" style="display:inline-flex;align-items:center">${esc(s.name)}${myServices().includes(s.id) ? ' · yours' : ''}</span>`).join('')}</div>` : '<p>Not on a subscription service in the US right now.</p>'}
      ${p.rent?.length || p.buy?.length ? `<p class="muted">Rent or buy: ${esc([...new Set([...(p.rent ?? []), ...(p.buy ?? [])].map((s) => s.name))].slice(0, 4).join(', '))}</p>` : ''}
      <p class="credits">Streaming data from JustWatch</p>
    </section>
    <h2>Your rating</h2>
    ${ratingForm(mine, id)}
    <h2>Friends</h2>
    ${others.length ? `<div class="list">${others.map((r) => reviewHtml(r, true)).join('')}</div>` : '<p class="muted">None of your friends have rated this yet.</p>'}`;
}

function ratingForm(mine, titleId, saveLabel = 'Save') {
  return `<form class="field" data-title="${esc(titleId)}" id="rate">
    <div class="ratings">${Object.entries(RATING).map(([k, v]) =>
      `<button type="button" class="${mine?.rating === k ? 'on' : ''}" data-act="pickRating" data-val="${k}" aria-pressed="${mine?.rating === k}">${v}</button>`).join('')}</div>
    <label for="note">One-line note (optional)</label>
    <input id="note" maxlength="200" value="${esc(mine?.note)}" placeholder="What should friends know?">
    <p class="muted">Loved and Liked put this in friends’ feeds. You can change your rating anytime.</p>
    <button class="primary big" type="button" data-act="saveRating">${saveLabel}</button></form>`;
}
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
  const { error } = await sb.from('ratings').upsert({ user_id: state.me.id, title_id: titleId, rating, note, source: form.dataset.source || 'search' });
  if (error) { el.disabled = false; throw error; }
  await sb.from('watchlist').update({ watched_at: new Date().toISOString() }).eq('title_id', titleId).is('watched_at', null);
  toast('Saved');
  if (form.dataset.after) location.hash = form.dataset.after; else route();
};

// ---------------------------------------------------------------- add

let searchTimer;
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
      box.innerHTML = results.length ? `<div class="list">${results.map((t) =>
        `<a class="item" href="#/rate/${encodeURIComponent(t.id)}" data-act="chooseTitle" data-id="${esc(t.id)}">
          <span class="row">${poster(t.poster_path, 'sm')}<span><strong>${esc(t.name)}</strong><br><span class="muted">${kind(t)}</span></span></span><span class="muted">›</span></a>`).join('')}</div>`
        : '<p class="muted">No matches. Try another spelling.</p>';
    }, 300);
  };
}
actions.chooseTitle = async (d) => {
  const { data: t } = await sb.from('titles').select('*').eq('id', d.id).single();
  const { data: mine } = await sb.from('ratings').select('rating, note').eq('title_id', d.id).eq('user_id', state.me.id).maybeSingle();
  await loadProviders([d.id]);
  $app.innerHTML = `
    <button class="link" data-act="backToAdd">← Search again</button>
    <div class="pick">${poster(t.poster_path, 'lg')}<div class="pick-body"><h1>${esc(t.name)}</h1><span class="muted">${kind(t)}</span>${watchOn(t.id)}</div></div>
    <h2>How was it?</h2>
    ${ratingForm(mine, d.id).replace('<form ', `<form data-after="#/title/${encodeURIComponent(d.id)}" `)}`;
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
  const svc = myServices().length ? myServices() : state.services.slice(0, 12).map((s) => s.id);
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
  await sb.from('quickpick_skips').upsert({ user_id: state.me.id, title_id: t.id });
  state.qp.i++; viewQuickpick();
};
actions.qpSave = async () => {
  const t = state.qp.cards[state.qp.i], f = state.qp.lovedBy.get(t.id);
  await sb.from('quickpick_skips').upsert({ user_id: state.me.id, title_id: t.id });
  await sb.from('watchlist').upsert({ user_id: state.me.id, title_id: t.id, watched_at: null });
  if (f) await sb.from('watchlist_credits').upsert({ user_id: state.me.id, title_id: t.id, recommender_id: f.user_id });
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
  $app.innerHTML = `
    <h1>Want to watch</h1>
    <div class="seg">${seg('listSvc', 'mine', 'On my services')}${seg('listSvc', 'all', 'All')}</div>
    <div class="seg">${seg('listType', 'all', 'All')}${seg('listType', 'tv', 'TV')}${seg('listType', 'movie', 'Movies')}</div>
    ${items.length ? items.map((r) => {
      const from = r.watchlist_credits.map((c) => esc(nameOf(c.recommender_id)));
      return `<div class="card pick">
        <a href="${titleLink(r.titles)}">${poster(r.titles.poster_path, 'sm')}</a>
        <div class="pick-body"><a class="title" href="${titleLink(r.titles)}">${esc(r.titles.name)}</a>
          <span class="muted">${from.length ? 'from <strong>' + from.join(', ') + '</strong>' : 'added by you'}</span>
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
  const [{ data: acts }, { count: nRatings }, { data: conns }] = await Promise.all([
    sb.from('activity').select('*, titles(name)').order('created_at', { ascending: false }).limit(20),
    sb.from('ratings').select('title_id', { count: 'exact', head: true }).eq('user_id', state.me.id),
    sb.from('connections').select('*'),
  ]);
  const friendIds = (conns ?? []).map((c) => (c.user_a === state.me.id ? c.user_b : c.user_a));
  const chosen = new Set(myServices());
  const actText = { loved_your_pick: 'loved your pick', liked_your_pick: 'liked your pick', thanks: 'said thanks for', joined: 'joined from your invite' };
  $app.innerHTML = `
    <div class="spread"><div><h1>${esc(state.me.name)}</h1><span class="muted">${nRatings ?? 0} ratings · ${friendIds.length} friends</span></div>
      <button class="link" data-act="editName">Edit name</button></div>
    <h2>Activity</h2>
    ${acts?.length ? `<div class="list">${acts.map((a) => `<div class="${a.read_at ? '' : 'unread'}">
      <strong>${esc(nameOf(a.actor_id))}</strong> ${actText[a.kind]} ${a.titles ? `<a href="#/title/${encodeURIComponent(a.title_id)}">${esc(a.titles.name)}</a>` : ''} <span class="muted">· ${when(a.created_at)}</span></div>`).join('')}</div>`
      : '<p class="muted">Nothing yet. When friends save or thank your picks, it shows here.</p>'}
    <h2>My services</h2>
    <p class="muted">Used for the My services filter and highlights.</p>
    <div class="row" id="svc">${state.services.slice(0, 16).map((s) =>
      `<button class="chip ${chosen.has(s.id) ? 'on' : ''}" data-act="toggleMySvc" data-id="${s.id}" aria-pressed="${chosen.has(s.id)}">${esc(s.name)}</button>`).join('')}</div>
    <div class="spread"><h2>Friends</h2>${state.me.is_host ? '<button class="primary" data-act="invite">Invite someone</button>' : ''}</div>
    ${friendIds.length ? `<div class="list">${friendIds.map((id) => `<a class="item" href="#/friend/${id}"><span>${esc(nameOf(id))}</span><span class="muted">›</span></a>`).join('')}</div>` : '<p class="muted">No friends connected yet.</p>'}
    <div id="inviteBox"></div>
    <h2>My ratings</h2>
    <a href="#/friend/${state.me.id}">See all my ratings</a>
    <div class="list">
      <div class="spread"><span>Weekly email (Sundays)</span><button class="chip ${state.me.weekly_email ? 'on' : ''}" data-act="toggleEmail">${state.me.weekly_email ? 'On' : 'Off'}</button></div>
      <a class="item" href="#/about"><span>About and credits</span><span class="muted">›</span></a>
      <button class="link" data-act="signOut">Sign out</button>
      <button class="link danger" data-act="deleteAccount">Delete my account</button>
    </div>`;
  await sb.from('activity').update({ read_at: new Date().toISOString() }).is('read_at', null);
}
actions.toggleMySvc = async (d, el) => {
  actions.toggleSvc(d, el);
  const services = [...document.querySelectorAll('#svc .chip.on')].map((b) => Number(b.dataset.id));
  await sb.from('profiles').update({ services }).eq('id', state.me.id);
  state.me.services = services;
};
actions.toggleEmail = async (d, el) => {
  state.me.weekly_email = !state.me.weekly_email;
  await sb.from('profiles').update({ weekly_email: state.me.weekly_email }).eq('id', state.me.id);
  el.textContent = state.me.weekly_email ? 'On' : 'Off'; el.classList.toggle('on', state.me.weekly_email);
};
actions.editName = async () => {
  const name = prompt('Your name, as friends see it', state.me.name);
  if (!name?.trim()) return;
  await sb.from('profiles').update({ name: name.trim() }).eq('id', state.me.id);
  route();
};
actions.invite = async () => {
  const { data, error } = await sb.from('invites').insert({ created_by: state.me.id }).select('code').single();
  if (error) throw error;
  const url = `${location.origin}${location.pathname}?invite=${data.code}`;
  document.getElementById('inviteBox').innerHTML = `<div class="card field">
    <p>Send this link to one person. It works once.</p>
    <input readonly value="${esc(url)}" id="inviteUrl">
    <div class="row"><button class="primary" data-act="shareInvite">Share</button><button data-act="copyInvite">Copy</button></div></div>`;
};
actions.shareInvite = async () => {
  const url = document.getElementById('inviteUrl').value;
  if (navigator.share) await navigator.share({ title: 'Join me on tv', text: 'TV and movie picks from friends and family:', url }).catch(() => {});
  else actions.copyInvite();
};
actions.copyInvite = async () => { await navigator.clipboard.writeText(document.getElementById('inviteUrl').value); toast('Link copied'); };
actions.signOut = async () => { await sb.auth.signOut(); };
actions.deleteAccount = async () => {
  if (!confirm('Delete your account and all your ratings? This can’t be undone.')) return;
  await sb.rpc('delete_my_account');
  await sb.auth.signOut();
};

function viewAbout() {
  $app.innerHTML = `
    <a href="#/me">← Back</a>
    <h1>About tv</h1>
    <p>A private place for friends and family to share what they’re watching.</p>
    <p class="credits">This product uses the TMDB API but is not endorsed or certified by TMDB. Title data and images from <a href="https://www.themoviedb.org">TMDB</a>. Streaming data from <a href="https://www.justwatch.com">JustWatch</a>.</p>`;
}

// ---------------------------------------------------------------- friend profile

async function viewFriend(id, filter = 'positive') {
  await loadPeople();
  const p = state.people.get(id);
  if (!p) { $app.innerHTML = '<p class="empty">Not found.</p>'; return; }
  const { data: rs } = await sb.from('ratings').select('user_id, title_id, rating, note, activity_at, titles(*)').eq('user_id', id).order('activity_at', { ascending: false });
  const shown = (rs ?? []).filter((r) => filter === 'all' || POSITIVE.includes(r.rating));
  await loadProviders(shown.map((r) => r.title_id));
  const svcNames = (state.services ?? []).filter((s) => (p.services ?? []).includes(s.id)).map((s) => s.name);
  $app.innerHTML = `
    <a href="javascript:history.back()">← Back</a>
    <h1>${esc(isMe(id) ? 'My ratings' : p.name)}</h1>
    <span class="muted">${(rs ?? []).length} ratings${svcNames.length && !isMe(id) ? ' · watches on ' + esc(svcNames.join(', ')) : ''}</span>
    <div class="seg"><button class="${filter === 'positive' ? 'on' : ''}" data-act="friendFilter" data-id="${id}" data-val="positive">Loved & Liked</button>
      <button class="${filter === 'all' ? 'on' : ''}" data-act="friendFilter" data-id="${id}" data-val="all">All</button></div>
    ${shown.length ? shown.map((r) => `<div class="card pick">
      <a href="${titleLink(r.titles)}">${poster(r.titles.poster_path, 'sm')}</a>
      <div class="pick-body"><a class="title" href="${titleLink(r.titles)}">${esc(r.titles.name)}</a>
        <span class="muted">${RATING[r.rating]} · ${kind(r.titles)}</span>${watchOn(r.title_id)}
        ${r.note ? `<div class="note">“${esc(r.note)}”</div>` : ''}</div>
      ${isMe(id) ? '' : `<button aria-label="Add to Want to watch" data-act="save" data-id="${esc(r.title_id)}">+</button>`}</div>`).join('')
      : '<p class="empty">Nothing here yet.</p>'}
    ${!isMe(id) && !p.is_host ? `<button class="link danger" data-act="removeFriend" data-id="${id}">Remove ${esc(p.name)} as a friend</button>` : ''}`;
}
actions.friendFilter = (d) => viewFriend(d.id, d.val);
actions.removeFriend = async (d) => {
  if (!confirm('Remove this friend? You’ll stop seeing each other’s picks.')) return;
  const [a, b] = [state.me.id, d.id].sort();
  await sb.from('connections').delete().eq('user_a', a).eq('user_b', b);
  state.me = null; location.hash = '#/me';
};

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
      route();
    }
  }, 0);
});
