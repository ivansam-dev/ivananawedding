/* Guest list & RSVP manager for the card.
   Fetched only when 囍 is tapped five times on the language screen, so guests never download it.
   Root admins see and change everything; link admins see each group with its Copy link button. */

const RSVP = [
  { value: 'attending', label: 'Attending' },
  { value: 'not_attending', label: 'Not attending' },
  { value: 'no_response', label: 'No response' }
];
/* the events guests reply to, in the invitation's order; each guest has an RSVP answer for each (field) */
const EVENTS = [
  { field: 'tea_rsvp', label: 'Tea ceremony' },
  { field: 'reception_rsvp', label: 'Reception' }
];
const comingTo = (x) => EVENTS.some((ev) => x[ev.field] === 'attending');
const awaiting = (x) => EVENTS.some((ev) => x[ev.field] === 'no_response');
const KINDS = [
  { value: 'save_the_date', label: 'Save the date' },
  { value: 'invitation', label: 'Invitation' }
];
const VIEWS = [
  { value: 'guests', label: 'Guests' },
  { value: 'groups', label: 'Groups' },
  { value: 'categories', label: 'Categories' },
  { value: 'letters', label: 'Letters' },
  { value: 'style', label: 'Letter style' },
  { value: 'layout', label: 'Card layout' }
];
/* the Letter style view: the envelope's look. Each value is one the card draws (applyStyle in index.html) */
const STYLE_CHOICES = {
  pattern: [
    { value: 'foil', label: 'Peony vines', note: 'The original foil' },
    { value: 'none', label: 'Plain' },
    { value: 'corner', label: 'Corner blossom', note: 'A spray in the top right' },
    { value: 'corners', label: 'Two corners', note: 'Top right and bottom left' },
    { value: 'blossoms', label: 'Scattered blossom' },
    { value: 'lattice', label: 'Lattice', note: 'A window lattice' },
    { value: 'clouds', label: 'Clouds', note: 'Auspicious clouds' },
    { value: 'waves', label: 'Waves' }
  ],
  finish: [
    { value: 'tone', label: 'Tone on tone' },
    { value: 'gold', label: 'Gold' }
  ],
  crease: [
    { value: 'none', label: 'None' },
    { value: 'gold', label: 'Gold line' },
    { value: 'double', label: 'Double rule' },
    { value: 'stitch', label: 'Stitched' },
    { value: 'pearls', label: 'Pearls' },
    { value: 'laurel', label: 'Laurel' }
  ],
  seal: [
    { value: 'red', label: 'Red' },
    { value: 'gold', label: 'Gold' },
    { value: 'tone', label: 'Matching' }
  ]
};
/* shades to start from: the flap's lacquer (the rest of the envelope follows it) */
const STYLE_SHADES = [
  { name: 'Cinnabar', colour: '#83171c' },
  { name: 'Deep moss', colour: '#3c4a24' },
  { name: 'Dark moss', colour: '#4a5a2c' },
  { name: 'Moss', colour: '#5a6b38' },
  { name: 'Olive moss', colour: '#69692e' },
  { name: 'Forest moss', colour: '#35503a' },
  { name: 'Sage moss', colour: '#6f7d55' }
];
const DARK_MOSS = '#4a5a2c', MOSS = '#5a6b38';
const STYLE_PRESETS = [
  { name: 'Cinnabar lacquer', note: 'The original', style: { colour: '#83171c', pattern: 'foil', finish: 'tone', strength: 1, crease: 'none', seal: 'red' } },
  { name: 'Moss lacquer', note: 'The original, in dark moss', style: { colour: DARK_MOSS, pattern: 'foil', finish: 'tone', strength: 1, crease: 'none', seal: 'tone' } },
  { name: 'Plain moss', note: 'Dark moss, nothing else', style: { colour: DARK_MOSS, pattern: 'none', finish: 'tone', strength: 1, crease: 'none', seal: 'gold' } },
  { name: 'Moss blossom', note: 'Blossom in the top right', style: { colour: MOSS, pattern: 'corner', finish: 'tone', strength: 1, crease: 'none', seal: 'gold' } },
  { name: 'Gilded moss', note: 'A double gold rule', style: { colour: DARK_MOSS, pattern: 'none', finish: 'tone', strength: 1, crease: 'double', seal: 'gold' } },
  { name: 'Moss & pearls', note: 'Gold blossom, pearls, red seal', style: { colour: DARK_MOSS, pattern: 'corners', finish: 'gold', strength: 0.85, crease: 'pearls', seal: 'red' } },
  { name: 'Laurel', note: 'A gold laurel on the creases', style: { colour: '#3c4a24', pattern: 'none', finish: 'tone', strength: 1, crease: 'laurel', seal: 'gold' } },
  { name: 'Lattice', note: 'A window lattice, stitched', style: { colour: MOSS, pattern: 'lattice', finish: 'tone', strength: 0.7, crease: 'stitch', seal: 'gold' } },
  { name: 'Waves', note: 'Fine waves, a gold line', style: { colour: '#35503a', pattern: 'waves', finish: 'tone', strength: 0.8, crease: 'gold', seal: 'gold' } },
  { name: 'Clouds', note: 'Gold clouds, red seal', style: { colour: DARK_MOSS, pattern: 'clouds', finish: 'gold', strength: 0.6, crease: 'none', seal: 'red' } }
];
/* the card's letters (one template each in index.html) and what each holds. Guests see the ones that are
   "Active", earliest (rank 1) on the left; their cards open on the one the admin marks "Opens first" */
const LETTERS = {
  save_the_date: { label: 'Save the date', inline: 'save the date', note: 'The dates and the city, and that invitations will follow.' },
  invitation: { label: 'Invitation', inline: 'invitation', note: 'Each day’s event, time and place (set in index.html), and when to reply.' },
  rsvp: { label: 'RSVP card', inline: 'RSVP card', note: 'Each guest on the link says whether they’re coming to the tea ceremony and to the reception, '
    + 'with any dietary requirements. The invitation’s RSVP button brings it forward. Only on a group’s own link, since other links can’t reply.' },
  details: { label: 'Details', inline: 'details', note: 'Questions and answers, such as the dress code and parking (FAQS in index.html).' }
};
const FILTERS = {
  guests: [
    { value: 'all', label: 'All guests' },
    { value: 'awaiting', label: 'Waiting on an RSVP' },
    /* "tea_rsvp:attending" and so on: one answer to one event */
    ...EVENTS.flatMap((ev) => RSVP.map((r) => ({ value: `${ev.field}:${r.value}`, label: `${ev.label}: ${r.label.toLowerCase()}` }))),
    { value: 'std_unsent', label: 'Save the date not sent' },
    { value: 'inv_unsent', label: 'Invitation not sent' }
  ],
  groups: [
    { value: 'all', label: 'All groups' },
    { value: 'std_unsent', label: 'Save the date not sent' },
    { value: 'inv_unsent', label: 'Invitation not sent' },
    { value: 'awaiting', label: 'Waiting on an RSVP' }
  ],
  categories: [{ value: 'all', label: 'All guests' }],  // the overview has no filter of its own
  letters: [{ value: 'all', label: 'All letters' }],    // nor do the letters
  style: [{ value: 'all', label: 'Letter style' }],      // nor the letter style
  layout: [{ value: 'all', label: 'Card layout' }]   // nor the card's layout
};
/* the overview's columns; each count opens the guests view filtered to it (filter: a FILTERS.guests value).
   Each event has a column per answer, beneath the event's name */
const OVERVIEW = [
  { label: 'Guests', filter: 'all', count: () => true },
  ...EVENTS.flatMap((ev) => RSVP.map((r, i) => ({
    label: r.label, event: ev, filter: `${ev.field}:${r.value}`, cls: `is-${r.value}${i ? '' : ' adm-ov-start'}`,
    count: (x) => x[ev.field] === r.value }))),
  { label: 'Save the date sent', filter: 'std_unsent', sent: true, cls: 'adm-ov-start', count: (x) => !!x.save_the_date_sent_at },
  { label: 'Invitation sent', filter: 'inv_unsent', sent: true, count: (x) => !!x.invitation_sent_at }
];
const SORTS = [
  { value: 'name', label: 'Sort by name' },
  { value: 'category', label: 'Sort by category' },
  { value: 'group', label: 'Sort by group' }
];
const NO_CATEGORY = ' none';  // the filter's "No category" choice; real categories never start with a space
const NO_LOCATION = ' none';  // likewise for locations
/* the two free-text labels a guest can have; the guests view shows both as tags */
const TAGS = {
  category: { key: 'cat', label: 'category', list: 'admCategories', none: 'No category' },
  location: { key: 'loc', label: 'location', list: 'admLocations', none: 'No location' }
};
const ON_CARD = 10;            // the card has room for this many names (cleanNames in index.html)

/* ---------- backend ---------- */

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function api(method, path, body) {
  const init = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try { res = await fetch('/api' + path, init); }
  catch (e) { throw new ApiError(0, 'Could not reach the server.'); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, explain(data) || `Something went wrong (${res.status}).`);
  return data;
}

function explain(data) {
  const d = data && data.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((e) => String(e.msg || '').replace(/^Value error, /, '')).filter(Boolean).join('; ');
  return '';
}

/** The signed-in admin ({ role, base_url }), or null if this device isn't signed in. */
export async function session() {
  try { return await api('GET', '/auth/me'); }
  catch (e) { if (e.status === 401) return null; throw e; }
}

/** Signs in. Throws an error whose .status is 401 (wrong password) or 429 (too many tries). */
export const login = (password) => api('POST', '/auth/login', { password });

/* ---------- small helpers ---------- */

/* builds elements; strings are always added as text, never parsed as HTML */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c);
  return el;
}
/* small line icons for the guest rows' hover buttons */
const ICONS = {
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  link: ['M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1', 'M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1'],
  open: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  check: ['M5 12.5l4.5 4.5L19 7']
};
function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: 17, height: 17, fill: 'none', stroke: 'currentColor',
                                        'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) {
    svg.setAttribute(k, v);
  }
  for (const d of ICONS[name]) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
const clean = (s) => String(s).replace(/\s+/g, ' ').trim();
/* search ignores case and accents, so "nguyen" finds "Nguyễn" */
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
const joinNames = (names) => (names.length < 2 ? names[0] || '' : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function loadStyles() {
  if (document.getElementById('admCss')) return Promise.resolve();
  return new Promise((resolve) => {
    const link = h('link', { id: 'admCss', rel: 'stylesheet', href: '/admin.css' });
    link.onload = link.onerror = () => resolve();
    document.head.append(link);
  });
}

/* ---------- the panel ---------- */

let current = null;

/** Opens the guest list over the page. options.onExpired runs if the session runs out. */
export async function openAdmin(me, options = {}) {
  await loadStyles();
  if (current) current.close();
  current = createPanel(me, options);
}

function createPanel(me, { onExpired } = {}) {
  const isRoot = me.role === 'root';
  // PUBLIC_URL may be written without its scheme ("ivanheartsana.com"); links sent to guests need https://
  const base = (me.base_url || location.origin).replace(/\/+$/, '').replace(/^(?!https?:\/\/)/i, 'https://');
  const linkFor = (g) => `${base}/${g.public_id}`;
  /* root admins start on one row per guest; link admins only ever see groups */
  const state = { groups: [], expanded: new Set(), query: '', filter: 'all', view: isRoot ? 'guests' : 'groups',
                  category: 'all', location: 'all', sort: 'name',
                  letters: null,    // [{ kind, active, rank, opens_first }], earliest first; loaded with the Letters view

                  editing: null };  // in the guests view, what's being edited: "name-<id>", "category-<id>" or "location-<id>"
  let styleEditor = null;                                 // the Letter style view, made the first time it's shown
  let layoutEditor = null;                                // likewise the Card layout view
  const byId = (id) => state.groups.find((g) => g.id === id);
  const nameOf = (x) => (typeof x === 'string' ? x : x.name);
  const findGuest = (id) => {
    for (const g of state.groups) for (const x of g.guests) if (x.id === id) return x;
    return null;
  };

  /* ----- layout ----- */
  const title = isRoot ? 'Guest list' : 'Invitation links';
  const closeBtn = h('button', { type: 'button', class: 'adm-close', 'aria-label': 'Close' }, '×');
  const signOutBtn = h('button', { type: 'button', class: 'adm-text-btn' }, 'Sign out');
  const search = h('input', { type: 'search', class: 'adm-search', placeholder: isRoot ? 'Search guests or groups' : 'Search',
                              'aria-label': 'Search', autocomplete: 'off' });
  const views = isRoot && h('div', { class: 'adm-views', role: 'group', 'aria-label': 'View' },
    VIEWS.map((v) => h('button', { type: 'button', class: 'adm-view', 'data-view': v.value,
                                   'aria-pressed': String(state.view === v.value) }, v.label)));
  const filter = isRoot && h('select', { class: 'adm-filter', 'aria-label': 'Show' });
  function fillFilter() {
    filter.replaceChildren(...FILTERS[state.view].map((f) => h('option', { value: f.value }, f.label)));
    filter.value = state.filter;
    filter.hidden = ['categories', 'letters', 'style', 'layout'].includes(state.view);
    search.hidden = ['letters', 'style', 'layout'].includes(state.view);
  }
  /* the guests view can also narrow to one guest category and location, and sort by category */
  const catFilter = isRoot && h('select', { class: 'adm-filter adm-cat-filter', 'aria-label': 'Guest category' });
  const locFilter = isRoot && h('select', { class: 'adm-filter adm-cat-filter', 'aria-label': 'Guest location' });
  const sortBy = isRoot && h('select', { class: 'adm-filter adm-sort', 'aria-label': 'Sort by' },
    SORTS.map((o) => h('option', { value: o.value }, o.label)));
  const catList = isRoot && h('datalist', { id: 'admCategories' });  // suggestions when typing a category
  const locList = isRoot && h('datalist', { id: 'admLocations' });   // ... or a location
  const distinct = (values) => [...new Set(values.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const valuesOf = (field) => distinct(state.groups.flatMap((g) => g.guests.map((x) => x[field])));
  const categories = () => valuesOf('category');
  function fillCategories() {
    if (!isRoot) return;
    const show = state.view === 'guests';
    const fill = (select, datalist, field, none, all) => {
      const values = valuesOf(field);
      if (state[field] !== 'all' && state[field] !== none && !values.includes(state[field])) state[field] = 'all';
      select.replaceChildren(
        h('option', { value: 'all' }, all),
        ...values.map((c) => h('option', { value: c }, c)),
        h('option', { value: none }, TAGS[field].none));
      select.value = state[field];
      datalist.replaceChildren(...values.map((c) => h('option', { value: c })));
      select.hidden = !show || !values.length;
    };
    fill(catFilter, catList, 'category', NO_CATEGORY, 'All categories');
    fill(locFilter, locList, 'location', NO_LOCATION, 'All locations');
    sortBy.hidden = !show;
  }
  if (isRoot) fillFilter();
  const newName = isRoot && h('input', { type: 'text', class: 'adm-input', placeholder: 'New group, e.g. The Lees',
                                          'aria-label': 'New group name', maxlength: 120, autocomplete: 'off' });
  const newForm = isRoot && h('form', { class: 'adm-new' }, newName, h('button', { type: 'submit', class: 'adm-btn' }, 'Add group'));
  const fileInput = isRoot && h('input', { type: 'file', accept: '.csv,text/csv,text/plain', hidden: true });
  const importBtn = isRoot && h('button', { type: 'button', class: 'adm-btn adm-btn-quiet' }, 'Import CSV');
  const clearBtn = isRoot && h('button', { type: 'button', class: 'adm-text-btn adm-danger' }, 'Clear list');
  /* adding groups, importing and clearing live behind ⋮ in the header, out of the way of day-to-day work */
  const menuBtn = isRoot && h('button', { type: 'button', class: 'adm-close adm-more', 'aria-label': 'Manage the list',
                                          title: 'Add a group, import or clear', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, '⋮');
  const menu = isRoot && h('div', { class: 'adm-menu', hidden: true },
    h('p', { class: 'adm-menu-label' }, 'Add a group'),
    newForm,
    h('div', { class: 'adm-menu-sep' }),
    h('div', { class: 'adm-file' }, importBtn, fileInput),
    h('p', { class: 'adm-hint' },
      'CSV columns: ', h('b', null, 'group'), ', ', h('b', null, 'name'), ' and optionally ', h('b', null, 'rank'),
      ', ', h('b', null, 'rsvp'), ' (for both events, or ', h('b', null, 'tea ceremony rsvp'), ' and ', h('b', null, 'reception rsvp'),
      '), ', h('b', null, 'guest category'), ' and ', h('b', null, 'guest location'),
      '. Guests in the same group share one link; rank sets who is named first. Guests already listed are skipped, ',
      'but get the file’s guest category and location if it has them.'),
    h('div', { class: 'adm-menu-sep' }),
    clearBtn);
  const menuWrap = isRoot && h('div', { class: 'adm-menu-wrap' }, menuBtn, menu);
  function setMenu(open) {
    if (!isRoot || menu.hidden === !open) return;
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) newName.focus({ preventScroll: true });
  }
  const stats = h('div', { class: 'adm-stats' });
  const flash = h('p', { class: 'adm-flash', role: 'status', 'aria-live': 'polite' });
  const list = h('div', { class: 'adm-list' }, h('p', { class: 'adm-empty' }, 'Loading…'));

  const panel = h('div', { class: 'adm', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: -1 },
    h('div', { class: 'adm-sheet' },
      h('header', { class: 'adm-head' },
        h('div', { class: 'adm-title' },
          h('span', { class: 'adm-xi', 'aria-hidden': 'true' }, '囍'),
          h('h1', null, title)),
        h('div', { class: 'adm-head-actions' }, signOutBtn, menuWrap, closeBtn)),
      isRoot ? stats : h('p', { class: 'adm-lede' }, 'Copy a group’s link and send it to them. The card greets them by name.'),
      h('div', { class: 'adm-tools' }, views, search, isRoot && h('div', { class: 'adm-break', 'aria-hidden': 'true' }), filter, catFilter, locFilter, sortBy, catList, locList),
      flash,
      list));
  document.body.append(panel);
  requestAnimationFrame(() => panel.classList.add('is-open'));
  panel.focus({ preventScroll: true });

  /* ----- messages ----- */
  let flashTimer = 0;
  function say(text, isError = false) {
    clearTimeout(flashTimer);
    flash.textContent = text;
    flash.classList.toggle('is-error', isError);
    flashTimer = setTimeout(() => { flash.textContent = ''; }, isError ? 9000 : 5000);
  }
  function fail(e) {
    if (e && e.status === 401) {                         // signed out elsewhere, or the session ran out
      close();
      if (onExpired) onExpired();
      return;
    }
    say((e && e.message) || 'Something went wrong.', true);
  }

  /* ----- data ----- */
  async function refresh() {
    state.groups = await api('GET', isRoot ? '/admin/groups' : '/admin/links');
    fillCategories();
    renderStats();
    renderList();
  }
  /* changes run one after another, so each response is applied in the order it was asked for.
     A response is a group (put in place by upsert) unless apply says otherwise */
  let queue = Promise.resolve();
  function mutate(request, { reload = false, apply = upsert } = {}) {
    const job = queue.then(async () => {
      try {
        const out = await request();
        if (reload || !out) await refresh();
        else apply(out);
        return out;
      } catch (e) {
        fail(e);
        return undefined;
      }
    });
    queue = job;
    return job;
  }
  function upsert(group) {
    const i = state.groups.findIndex((g) => g.id === group.id);
    if (i >= 0) state.groups[i] = group; else state.groups.push(group);
    fillCategories();
    renderStats();
    if (state.view === 'guests') renderList(); else renderGroup(group.id);
  }

  /* the letters: every change returns all of them, since a new rank can move another letter too */
  function setLetters(letters) {
    state.letters = letters;
    if (state.view === 'letters') renderList();
  }
  function loadLetters() {
    return api('GET', '/admin/letters').then(setLetters, fail);
  }
  async function changeLetter(kind, body) {
    const out = await mutate(() => api('PATCH', `/admin/letters/${kind}`, body), { apply: setLetters });
    if (!out && state.view === 'letters') renderList();  // refused: put the switch or rank back as it was
  }

  /* ----- what's shown ----- */
  const sentCount = (g, kind) => g.guests.filter((x) => x[`${kind}_sent_at`]).length;
  function sentState(g, kind) {
    const n = sentCount(g, kind);
    return !g.guests.length || !n ? 'none' : n === g.guests.length ? 'all' : 'some';
  }
  /* q is the search text, already folded */
  function matches(g, q) {
    if (q &&!fold(g.name).includes(q) && !g.guests.some((x) => fold(nameOf(x)).includes(q))) return false;
    switch (state.filter) {
      case 'std_unsent': return sentState(g, 'save_the_date') !== 'all';
      case 'inv_unsent': return sentState(g, 'invitation') !== 'all';
      case 'awaiting': return g.guests.some(awaiting);
      default: return true;
    }
  }

  function guestMatches(x, g, q) {
    if (q && ![x.name, g.name, x.category, x.location].some((v) => fold(v).includes(q))) return false;
    if (state.category === NO_CATEGORY ? x.category : state.category !== 'all' && x.category !== state.category) return false;
    if (state.location === NO_LOCATION ? x.location : state.location !== 'all' && x.location !== state.location) return false;
    switch (state.filter) {
      case 'all': return true;
      case 'awaiting': return awaiting(x);
      case 'std_unsent': return !x.save_the_date_sent_at;
      case 'inv_unsent': return !x.invitation_sent_at;
      default: {                                          // one answer to one event, e.g. "tea_rsvp:attending"
        const [field, value] = state.filter.split(':');
        return x[field] === value;
      }
    }
  }

  function renderStats() {
    if (!isRoot) return;
    const guests = state.groups.flatMap((g) => g.guests);
    const withGuests = state.groups.filter((g) => g.guests.length);
    const sentGroups = (k) => withGuests.filter((g) => sentState(g, k) === 'all').length;
    const stat = (value, label, cls = '', more = null) =>
      h('div', { class: `adm-stat ${cls}` }, h('strong', null, String(value)), h('span', null, label),
        more && h('span', { class: 'adm-stat-more' }, more));
    /* each event: how many are coming, then how many aren't and how many are still to say */
    const event = (ev) => {
      const n = (v) => guests.filter((x) => x[ev.field] === v).length;
      return stat(n('attending'), `attending the ${ev.label.toLowerCase()}`, 'is-attending adm-stat-event',
        [h('span', { class: 'is-not_attending' }, `${n('not_attending')} not attending`), ' · ',
         h('span', { class: 'is-no_response' }, `${n('no_response')} no response`)]);
    };
    stats.replaceChildren(
      stat(guests.length, guests.length === 1 ? 'guest' : 'guests'),
      stat(state.groups.length, state.groups.length === 1 ? 'group' : 'groups'),
      ...EVENTS.map(event),
      stat(`${sentGroups('save_the_date')}/${withGuests.length}`, 'groups sent the save the date'),
      stat(`${sentGroups('invitation')}/${withGuests.length}`, 'groups sent the invitation'));
  }

  /* re-rendering replaces elements; put the cursor back where it was */
  function keepFocus(scope, render) {
    const a = document.activeElement;
    const key = a && scope.contains(a) ? a.dataset.key : null;
    const typed = key && a.tagName === 'INPUT' ? { value: a.value, start: a.selectionStart, end: a.selectionEnd } : null;
    render();
    if (!key) return;
    const b = panel.querySelector(`[data-key="${CSS.escape(key)}"]`);  // keys can hold category names
    if (!b || b.disabled) return;
    b.focus({ preventScroll: true });
    if (typed) {
      b.value = typed.value;
      try { b.setSelectionRange(typed.start, typed.end); } catch (e) { /* not a text field */ }
    }
  }
  function renderList() {
    keepFocus(list, () => {
      if (state.view === 'letters') {
        list.classList.remove('is-guests');
        list.replaceChildren(...letterRows());
        return;
      }
      if (state.view === 'style') {                       // built once and kept, so a slider being dragged survives
        list.classList.remove('is-guests');
        styleEditor ||= createStyleEditor({ say, fail, close, copyUrl, base });
        if (styleEditor.el.parentNode !== list) list.replaceChildren(styleEditor.el);
        return;
      }
      if (state.view === 'layout') {                      // kept the same way, so a piece being dragged survives
        list.classList.remove('is-guests');
        layoutEditor ||= createLayoutEditor({ say, fail, close });
        if (layoutEditor.el.parentNode !== list) list.replaceChildren(layoutEditor.el);
        return;
      }
      let shown;
      const q = fold(state.query.trim());
      if (state.view === 'guests') {
        shown = guestRows(q);
      } else if (state.view === 'categories') {
        shown = categoryOverview(q);
      } else {
        shown = state.groups.filter((g) => matches(g, q)).map(groupEl);
      }
      const hasGuests = state.groups.some((g) => g.guests.length);
      const empty = !state.groups.length || (state.view !== 'groups' && !hasGuests)
        ? (isRoot ? 'No guests yet. Add a group above, or import a CSV.' : 'No groups yet.')
        : 'Nothing matches.';
      list.classList.toggle('is-guests', state.view === 'guests');
      list.replaceChildren(...(shown.length ? shown : [h('p', { class: 'adm-empty' }, empty)]));
    });
  }
  /* the guests view's rows, sorted; sorting by category adds a heading (with a count) above each one */
  function guestRows(q) {
    const rows = state.groups.flatMap((g) => g.guests.filter((x) => guestMatches(x, g, q))
      .map((x) => ({ x, g, name: fold(x.name), cat: fold(x.category), loc: fold(x.location), group: fold(g.name) })));
    const by = (k) => (a, b) => a[k].localeCompare(b[k]);
    const byName = by('name');
    const blankLast = (k) => (a, b) => (!a[k] - !b[k]) || by(k)(a, b);  // guests with no category (or location) go last
    const cmp = state.sort === 'category' ? (a, b) => blankLast('cat')(a, b) || blankLast('loc')(a, b) || byName(a, b)
      : state.sort === 'group' ? (a, b) => by('group')(a, b) || a.g.id - b.g.id || a.x.rank - b.x.rank
      : byName;
    rows.sort(cmp);
    if (state.sort !== 'category') return rows.map((r) => guestRowEl(r.g, r.x));
    const out = [];
    for (let i = 0; i < rows.length;) {
      let j = i;
      while (j < rows.length && rows[j].cat === rows[i].cat) j++;   // "Family" and "family" share a heading
      const coming = EVENTS.map((ev) => [ev, rows.slice(i, j).filter((r) => r.x[ev.field] === 'attending').length])
        .filter(([, n]) => n).map(([ev, n]) => ` · ${n} at the ${ev.label.toLowerCase()}`);
      out.push(h('h2', { class: 'adm-cat-head' }, rows[i].x.category || 'No category',
        h('span', null, `${plural(j - i, 'guest')}${coming.join('')}`)));
      for (let k = i; k < j; k++) out.push(guestRowEl(rows[k].g, rows[k].x));
      i = j;
    }
    return out;
  }

  /* one row per guest category (and "No category"), each broken down by guest location beneath it,
     counting RSVPs and what's been sent, with a total */
  function categoryOverview(q) {
    const guests = state.groups.flatMap((g) => g.guests);
    const withNone = (values, none, label) => [...values.map((c) => [c, c]), [none, label]];
    const rows = [];
    for (const [value, label] of withNone(categories(), NO_CATEGORY, 'No category')) {
      const inCat = guests.filter((x) => (value === NO_CATEGORY ? !x.category : x.category === value));
      if (!inCat.length) continue;
      const catHit = !q || fold(label).includes(q);
      /* only worth breaking down when someone in it has a location */
      const subs = !inCat.some((x) => x.location) ? []
        : withNone(distinct(inCat.map((x) => x.location)), NO_LOCATION, 'No location')
          .map(([loc, locLabel]) => ({ value, loc, label: locLabel, full: `${label} › ${locLabel}`, sub: true,
                                       guests: inCat.filter((x) => (loc === NO_LOCATION ? !x.location : x.location === loc)) }))
          .filter((r) => r.guests.length && (catHit || fold(r.label).includes(q)));
      if (!catHit && !subs.length) continue;
      rows.push({ value, loc: 'all', label, guests: inCat }, ...subs);
    }
    if (!rows.length) return [];

    const cell = (r, col) => {
      const n = r.guests.filter(col.count).length, total = r.guests.length;
      const pct = total ? Math.round((n / total) * 100) : 0;
      /* "sent" columns link to the guests still waiting for it, which is what you'd act on */
      const filter = col.sent ? (n < total ? col.filter : 'all') : col.filter;
      const tip = col.sent ? (n < total ? `Show the ${total - n} not sent yet` : 'Sent to everyone')
        : `Show ${col.event ? `${col.event.label.toLowerCase()}: ` : ''}${col.label.toLowerCase()}`;
      return h('td', { class: col.cls || '' },
        r.value == null ? h('span', { class: 'adm-ov-n' }, String(n))
          : h('button', { type: 'button', class: 'adm-ov-n', 'data-cat': r.value, 'data-loc': r.loc, 'data-filter': filter, title: tip,
                          'data-key': `ov-${r.value}-${r.loc}-${col.filter}` }, String(n)),
        col.sent && total > 0 && h('span', { class: `adm-ov-pct${n === total ? ' is-done' : ''}` }, `${pct}%`));
    };
    /* a bar per event, in the invitation's order, split by answer */
    const bars = (list) => h('span', { class: 'adm-ov-bars', 'aria-hidden': 'true' }, EVENTS.map((ev) =>
      h('span', { class: 'adm-ov-bar', title: ev.label },
        RSVP.map((r) => {
          const n = list.filter((x) => x[ev.field] === r.value).length;
          return n ? h('span', { class: `is-${r.value}`, style: `flex-grow:${n}` }) : null;
        }))));
    const row = (r, tag = 'td') => h('tr', { class: r.sub ? 'adm-ov-sub' : '' },
      h(tag, { class: 'adm-ov-cat', scope: 'row' },
        r.value == null ? r.label
          : h('button', { type: 'button', class: 'adm-ov-name', 'data-cat': r.value, 'data-loc': r.loc, 'data-filter': 'all',
                          'data-key': `ov-${r.value}-${r.loc}`, title: `Show everyone in ${r.full || r.label}` }, r.label),
        bars(r.guests)),
      OVERVIEW.map((col) => cell(r, col)));

    /* two header rows: each event's name over its answers, which have the second row to themselves */
    const top = OVERVIEW.flatMap((col, i) => (!col.event ? [h('th', { scope: 'col', rowspan: 2, class: col.cls || '' }, col.label)]
      : OVERVIEW[i - 1].event === col.event ? []
      : [h('th', { scope: 'colgroup', colspan: RSVP.length, class: 'adm-ov-event adm-ov-start' }, col.event.label)]));
    const table = h('table', { class: 'adm-ov' },
      h('thead', null,
        h('tr', null, h('th', { scope: 'col', rowspan: 2 }, 'Guest category › location'), top),
        h('tr', null, OVERVIEW.filter((col) => col.event).map((col) => h('th', { scope: 'col', class: col.cls }, col.label)))),
      h('tbody', null, rows.map((r) => row(r, 'th'))),
      !q && rows.filter((r) => !r.sub).length > 1 && h('tfoot', null, row({ value: null, label: 'Everyone', guests }, 'th')));
    return [h('div', { class: 'adm-ov-wrap' }, table),
      h('p', { class: 'adm-hint' }, 'Click a number to see those guests.')];
  }

  /* one row per letter, earliest first, saying where guests see it; each can be switched on or off,
     made the one guests' cards open on, given another rank, or previewed */
  function letterRows() {
    if (!state.letters) return [h('p', { class: 'adm-empty' }, 'Loading…')];
    const name = (kind) => (LETTERS[kind] || { inline: kind }).inline;   // mid-sentence
    const on = state.letters.filter((l) => l.active);
    const opener = on.find((l) => l.opens_first) || on[on.length - 1];
    const where = (l) => (!l.active ? 'Off: guests don’t see it.'
      : l !== opener ? `Beneath the ${name(opener.kind)}; guests can tap it to bring it forward.`
      : on.length > 1 ? 'Guests’ cards open on this, with the others beneath it.'
      : 'Guests see this, on its own.');
    const rows = state.letters.map((l) => {
      const label = (LETTERS[l.kind] || { label: l.kind }).label, inline = name(l.kind), lastOn = l.active && on.length === 1;
      const opens = l === opener;
      const offTitle = lastOn ? 'One letter has to stay active, or guests would have nothing to open'
        : opens ? 'Guests’ cards open on this one: make another open first before switching it off' : null;
      return h('div', { class: `adm-letter${l.active ? '' : ' is-off'}`, 'data-letter': l.kind },
        h('div', { class: 'adm-letter-about' },
          h('span', { class: 'adm-letter-name' }, label),
          h('span', { class: 'adm-letter-where' }, where(l)),
          h('span', { class: 'adm-letter-note' }, (LETTERS[l.kind] || {}).note || '')),
        h('div', { class: 'adm-rsvp', role: 'group', 'aria-label': `Show the ${inline} to guests` },
          [true, false].map((value) => h('button', {
            type: 'button', class: `adm-seg ${value ? 'is-on' : 'is-off'}`, 'data-act': 'letter-active', 'data-value': String(value),
            'aria-pressed': String(l.active === value), disabled: !value && (lastOn || opens), 'data-key': `active-${l.kind}-${value}`,
            title: value ? null : offTitle
          }, value ? 'Active' : 'Off'))),
        h('label', { class: `adm-letter-opens${opens ? ' is-on' : ''}`,
                     title: opens ? 'Guests’ cards open on this letter' : `Open guests’ cards on the ${inline}${l.active ? '' : ' (this switches it on)'}` },
          h('input', { type: 'radio', name: 'letter-opens', 'data-change': 'letter-opens', 'data-key': `opens-${l.kind}`, checked: opens }),
          h('span', null, 'Opens first')),
        h('label', { class: 'adm-letter-rank' }, h('span', null, 'Rank'),
          h('select', { class: 'adm-filter', 'data-change': 'letter-rank', 'data-key': `rank-${l.kind}`,
                        'aria-label': `Rank of the ${inline}` },
            state.letters.map((_, i) => h('option', { value: i + 1, selected: i + 1 === l.rank }, String(i + 1))))),
        h('a', { class: 'adm-text-btn adm-preview', href: `/?letter=${l.kind}&to=Guest`, target: '_blank', rel: 'noopener',
                 title: `Open the card on the ${inline}, even while it’s off` }, 'Preview', icon('open')));
    });
    return [...rows, h('p', { class: 'adm-hint' },
      'A guest’s card opens on the letter marked ', h('b', null, 'Opens first'), ', which needn’t be the newest. ',
      'The other active letters sit in a row beneath it, earliest on the left, and a tap brings one forward. ',
      'Rank 1 is the earliest letter; picking a rank another letter has swaps the two.')];
  }

  function renderGroup(id) {
    const old = list.querySelector(`[data-group="${id}"]`);
    const g = byId(id);
    if (!old || !g) { renderList(); return; }
    keepFocus(old, () => old.replaceWith(groupEl(g)));
  }

  function groupEl(g) {
    const open = isRoot && state.expanded.has(g.id);
    const names = g.guests.map(nameOf);
    const summary = h('span', { class: 'adm-summary' },
      h('span', { class: 'adm-group-name' }, g.name),
      h('span', { class: 'adm-group-who' }, names.length ? joinNames(names) : 'No guests yet'),
      isRoot && g.guests.length > 0 && rsvpSummary(g));
    return h('article', { class: `adm-group${open ? ' is-open' : ''}`, 'data-group': g.id },
      h('div', { class: 'adm-group-head' },
        isRoot
          ? h('button', { type: 'button', class: 'adm-toggle', 'data-act': 'toggle', 'aria-expanded': String(open),
                          'data-key': `toggle-${g.id}` }, h('span', { class: 'adm-caret', 'aria-hidden': 'true' }), summary)
          : h('div', { class: 'adm-toggle is-static' }, summary),
        isRoot && h('div', { class: 'adm-chips' }, KINDS.map((k) => groupChip(g, k))),
        h('button', { type: 'button', class: 'adm-copy', 'data-act': 'copy', 'data-key': `copy-${g.id}` }, 'Copy link')),
      open && groupBody(g));
  }

  /* a line per event: its name, then how many gave each answer */
  function rsvpSummary(g) {
    return h('span', { class: 'adm-group-rsvp' }, EVENTS.map((ev) =>
      h('span', { class: 'adm-group-event' },
        h('span', { class: 'adm-group-event-name' }, ev.label),
        RSVP.map((r) => [r, g.guests.filter((x) => x[ev.field] === r.value).length])
          .filter(([, n]) => n)
          .map(([r, n]) => h('span', { class: `adm-dot is-${r.value}` }, `${n} ${r.label.toLowerCase()}`)))));
  }

  /* a guest's answers: for each event, its name and attending / not attending / no response */
  function answersEl(x) {
    return h('div', { class: 'adm-answers' }, EVENTS.map((ev) => [
      h('span', { class: 'adm-answer-name', 'aria-hidden': 'true' }, ev.label),
      h('div', { class: 'adm-rsvp', role: 'group', 'aria-label': `${ev.label} RSVP for ${x.name}` },
        RSVP.map((r) => h('button', { type: 'button', class: `adm-seg is-${r.value}`, 'data-act': 'rsvp', 'data-field': ev.field,
                                      'data-value': r.value, 'aria-pressed': String(x[ev.field] === r.value),
                                      'data-key': `rsvp-${x.id}-${ev.field}-${r.value}` }, r.label)))]));
  }

  function groupChip(g, k) {
    const st = sentState(g, k.value), n = sentCount(g, k.value), total = g.guests.length;
    const tip = !total ? 'Add guests first'
      : st === 'all' ? `${k.label} sent to everyone here. Click to mark it as not sent.`
      : `Mark the ${k.label.toLowerCase()} as sent to everyone here`;
    return h('button', { type: 'button', class: `adm-chip is-${st}`, 'data-act': 'group-sent', 'data-kind': k.value,
                         'aria-pressed': String(st === 'all'), title: tip, disabled: !total, 'data-key': `chip-${g.id}-${k.value}` },
      h('span', { class: 'adm-tick', 'aria-hidden': 'true' }), k.label,
      st === 'some' && h('span', { class: 'adm-frac' }, `${n}/${total}`));
  }

  function groupBody(g) {
    return h('div', { class: 'adm-group-body' },
      g.guests.length > ON_CARD && h('p', { class: 'adm-warn' },
        `The card has room for ${ON_CARD} names, so only the first ${ON_CARD} will show.`),
      g.guests.length > 0 && h('ol', { class: 'adm-guests' }, g.guests.map((x, i) => guestEl(g, x, i))),
      h('form', { class: 'adm-add', 'data-submit': 'add-guest' },
        h('input', { type: 'text', class: 'adm-input', placeholder: 'Add a guest to this group', maxlength: 60,
                     'aria-label': `Add a guest to ${g.name}`, autocomplete: 'off', 'data-key': `add-${g.id}` }),
        h('button', { type: 'submit', class: 'adm-btn adm-btn-quiet' }, 'Add')),
      h('div', { class: 'adm-group-foot' },
        h('label', { class: 'adm-field' }, h('span', null, 'Group name'),
          h('input', { type: 'text', class: 'adm-input', value: g.name, maxlength: 120, autocomplete: 'off',
                       'data-change': 'rename-group', 'data-key': `gname-${g.id}` })),
        h('div', { class: 'adm-field' }, h('span', null, 'Link (opens the card as they will see it)'),
          h('a', { class: 'adm-url', href: `/${g.public_id}`, target: '_blank', rel: 'noopener' }, linkFor(g))),
        h('button', { type: 'button', class: 'adm-text-btn adm-danger', 'data-act': 'delete-group' }, 'Delete group')));
  }

  function guestEl(g, x, i) {
    const others = state.groups.filter((o) => o.id !== g.id);
    return h('li', { class: 'adm-guest', 'data-guest': x.id },
      h('div', { class: 'adm-order' },
        h('span', { class: 'adm-rank', title: 'Order on the card' }, String(i + 1)),
        h('button', { type: 'button', class: 'adm-icon', 'data-act': 'up', disabled: i === 0,
                      'aria-label': `Move ${x.name} up`, 'data-key': `up-${x.id}` }, '↑'),
        h('button', { type: 'button', class: 'adm-icon', 'data-act': 'down', disabled: i === g.guests.length - 1,
                      'aria-label': `Move ${x.name} down`, 'data-key': `down-${x.id}` }, '↓')),
      h('input', { type: 'text', class: 'adm-input adm-name', value: x.name, maxlength: 60, autocomplete: 'off',
                   'aria-label': 'Guest name', 'data-change': 'rename-guest', 'data-key': `name-${x.id}` }),
      answersEl(x),
      h('div', { class: 'adm-sent' },
        KINDS.map((k) => {
          const at = x[`${k.value}_sent_at`];
          return h('button', { type: 'button', class: `adm-mini${at ? ' is-on' : ''}`, 'data-act': 'guest-sent', 'data-kind': k.value,
                               'aria-pressed': String(!!at), title: at ? `${k.label} sent ${fmtDate(at)}` : `${k.label} not sent`,
                               'data-key': `sent-${x.id}-${k.value}` },
            h('span', { class: 'adm-tick', 'aria-hidden': 'true' }), k.label);
        })),
      h('select', { class: 'adm-move', 'aria-label': `Move ${x.name} to another group`, 'data-change': 'move', 'data-key': `move-${x.id}` },
        h('option', { value: '' }, 'Move to…'),
        others.map((o) => h('option', { value: o.id }, o.name)),
        h('option', { value: 'new' }, 'A new group…')),
      h('button', { type: 'button', class: 'adm-icon adm-danger', 'data-act': 'delete-guest',
                    'aria-label': `Remove ${x.name}`, title: 'Remove from the guest list' }, '×'),
      (comingTo(x) || x.dietary) &&                             // guests fill this in on the card's reply
        h('input', { type: 'text', class: 'adm-input adm-diet', value: x.dietary, maxlength: 300, autocomplete: 'off',
                     placeholder: 'Dietary requirements', 'aria-label': `Dietary requirements for ${x.name}`,
                     'data-change': 'dietary', 'data-key': `diet-${x.id}` }));
  }

  /* one row per guest: their name, with edit / copy link / open group on hover; their category and location; their RSVPs */
  function guestRowEl(g, x) {
    const name = state.editing === `name-${x.id}`
      ? h('input', { type: 'text', class: 'adm-input adm-row-name', value: x.name, maxlength: 60, autocomplete: 'off',
                     'aria-label': `New name for ${x.name}`, 'data-edit': 'name', 'data-key': `name-${x.id}` })
      : h('div', { class: 'adm-row-who' },
          h('span', { class: 'adm-row-name' }, x.name),
          x.dietary && h('span', { class: 'adm-row-diet', title: 'Dietary requirements' }, x.dietary),
          h('div', { class: 'adm-row-acts' },                // shown on hover
            h('button', { type: 'button', class: 'adm-icon adm-edit', 'data-act': 'edit', 'data-field': 'name', 'data-key': `edit-${x.id}`,
                          'aria-label': `Edit ${x.name}'s name`, title: 'Edit name' }, icon('edit')),
            h('button', { type: 'button', class: 'adm-icon', 'data-act': 'copy', 'data-key': `copy-guest-${x.id}`,
                          'aria-label': `Copy the link for ${g.name}`, title: `Copy link (${g.name})` }, icon('link')),
            h('button', { type: 'button', class: 'adm-icon', 'data-act': 'open-group', 'data-key': `open-${x.id}`,
                          'aria-label': `Open group: ${g.name}`, title: `Open group (${g.name})` }, icon('open'))));
    const tag = (field) => {
      const t = TAGS[field], value = x[field];
      return state.editing === `${field}-${x.id}`
        ? h('input', { type: 'text', class: 'adm-input adm-row-cat', value, maxlength: 60, autocomplete: 'off',
                       list: t.list, placeholder: field === 'category' ? 'Category' : 'Location',
                       'aria-label': `Guest ${t.label} for ${x.name}`, 'data-edit': field, 'data-key': `${t.key}-${x.id}` })
        : h('button', { type: 'button', class: `adm-row-cat adm-tag${value ? '' : ' is-empty'}`, 'data-act': 'edit',
                        'data-field': field, 'data-key': `edit-${t.key}-${x.id}`,
                        title: value ? `Change guest ${t.label}` : `Add a guest ${t.label}`,
                        'aria-label': value ? `Guest ${t.label}: ${value}. Change it` : `Add a guest ${t.label} for ${x.name}` },
            value || `+ ${t.label}`);
    };
    return h('div', { class: 'adm-row', 'data-group': g.id, 'data-guest': x.id },
      name,
      tag('category'),
      tag('location'),
      answersEl(x));
  }

  function setView(view, { openGroup = null } = {}) {
    state.view = view;
    if (!FILTERS[view].some((f) => f.value === state.filter)) state.filter = 'all';
    for (const b of views.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === view));
    if (openGroup != null) {                              // jumping to a guest's group: make sure it's shown and open
      state.query = search.value = '';
      state.filter = 'all';
      state.category = state.location = 'all';
      state.expanded.add(openGroup);
    }
    fillFilter();
    fillCategories();
    renderList();
    if (view === 'letters') loadLetters();                // fresh each time, in case they changed elsewhere
    if (view === 'style') styleEditor.load();             // likewise what guests see
    if (view === 'layout') layoutEditor.load();
    if (openGroup != null) {
      const node = list.querySelector(`[data-group="${openGroup}"]`);
      if (node) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  /* ----- actions ----- */
  function context(el) {
    const groupNode = el.closest('[data-group]');
    const g = groupNode ? byId(Number(groupNode.dataset.group)) : null;
    const guestNode = el.closest('[data-guest]');
    const x = g && guestNode ? g.guests.find((y) => y.id === Number(guestNode.dataset.guest)) : null;
    return { g, x };
  }

  list.addEventListener('click', (e) => {
    const jump = e.target.closest('[data-cat]');          // the overview: show that category's (and location's) guests
    if (jump) {
      state.query = search.value = '';
      state.category = jump.dataset.cat;
      state.location = jump.dataset.loc || 'all';
      state.filter = jump.dataset.filter;
      setView('guests');
      list.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (el.dataset.act === 'letter-active') {
      const kind = el.closest('[data-letter]').dataset.letter, active = el.dataset.value === 'true';
      const l = state.letters && state.letters.find((y) => y.kind === kind);
      if (l && l.active !== active) changeLetter(kind, { active });
      return;
    }
    const { g, x } = context(el);
    if (!g) return;
    const kind = el.dataset.kind;
    switch (el.dataset.act) {
      case 'toggle':
        if (state.expanded.has(g.id)) state.expanded.delete(g.id); else state.expanded.add(g.id);
        renderGroup(g.id);
        break;
      case 'copy':
        copyLink(g, el);
        break;
      case 'open-group':
        setView('groups', { openGroup: g.id });
        break;
      case 'edit': {
        if (!x) break;
        const field = el.dataset.field;
        state.editing = `${field}-${x.id}`;
        const row = el.closest('.adm-row');
        row.replaceWith(guestRowEl(g, x));
        const input = list.querySelector(`[data-key="${field === 'name' ? 'name' : TAGS[field].key}-${x.id}"]`);
        if (input) { input.focus(); input.select(); }
        break;
      }
      case 'group-sent':                                   // all sent: undo for everyone; otherwise send to everyone
        mutate(() => api('POST', `/admin/groups/${g.id}/sent`, { kind, sent: sentState(byId(g.id) || g, kind) !== 'all' }));
        break;
      case 'rsvp': {
        const field = el.dataset.field;
        if (x && x[field] !== el.dataset.value) mutate(() => api('PATCH', `/admin/guests/${x.id}`, { [field]: el.dataset.value }));
        break;
      }
      case 'guest-sent':
        if (x) mutate(() => api('PATCH', `/admin/guests/${x.id}`, { [`${kind}_sent`]: !(findGuest(x.id) || x)[`${kind}_sent_at`] }));
        break;
      case 'up':
      case 'down': {
        if (!x) break;
        const step = el.dataset.act === 'up' ? -1 : 1;
        mutate(() => {                                     // worked out from the latest order, so quick taps add up
          const now = byId(g.id) || g;
          const ids = now.guests.map((y) => y.id), i = ids.indexOf(x.id), j = i + step;
          if (i < 0 || j < 0 || j >= ids.length) return Promise.resolve(now);
          [ids[i], ids[j]] = [ids[j], ids[i]];
          return api('PUT', `/admin/groups/${g.id}/order`, { guest_ids: ids });
        });
        break;
      }
      case 'delete-guest':
        if (x && confirm(`Remove ${x.name} from the guest list?`)) mutate(() => api('DELETE', `/admin/guests/${x.id}`));
        break;
      case 'delete-group': {
        const n = g.guests.length;
        if (confirm(`Delete “${g.name}”${n ? ` and its ${plural(n, 'guest')}` : ''}? Its link will stop greeting anyone by name.`)) {
          state.expanded.delete(g.id);
          mutate(() => api('DELETE', `/admin/groups/${g.id}`), { reload: true });
        }
        break;
      }
    }
  });

  list.addEventListener('change', (e) => {
    const el = e.target, act = el.dataset.change;
    if (!act) return;
    if (act === 'letter-opens') {
      if (el.checked) changeLetter(el.closest('[data-letter]').dataset.letter, { opens_first: true });
      return;
    }
    if (act === 'letter-rank') {
      changeLetter(el.closest('[data-letter]').dataset.letter, { rank: Number(el.value) });
      return;
    }
    const { g, x } = context(el);
    if (!g) return;
    if (act === 'rename-guest' && x) {
      const name = clean(el.value);
      if (!name) { el.value = x.name; return; }
      if (name !== x.name) mutate(() => api('PATCH', `/admin/guests/${x.id}`, { name }));
    } else if (act === 'dietary' && x) {
      const dietary = clean(el.value);
      if (dietary !== x.dietary) mutate(() => api('PATCH', `/admin/guests/${x.id}`, { dietary }));
    } else if (act === 'rename-group') {
      const name = clean(el.value);
      if (!name) { el.value = g.name; return; }
      if (name !== g.name) mutate(() => api('PATCH', `/admin/groups/${g.id}`, { name }));
    } else if (act === 'move' && x) {
      const target = el.value;
      el.value = '';
      if (target) moveGuest(x, target);
    }
  });

  /* renaming in the guests view: Enter or clicking away saves, Escape cancels */
  list.addEventListener('keydown', (e) => {
    const el = e.target;
    if (!el.dataset.edit) return;
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); el.dataset.cancel = '1'; el.blur(); }
  });
  list.addEventListener('focusout', (e) => {
    const el = e.target;
    const field = el.dataset.edit;
    if (!field || !el.isConnected || !list.contains(el)) return;  // a re-render took it, not the user
    const { g, x } = context(el);
    state.editing = null;
    if (!g || !x) { renderList(); return; }
    const value = clean(el.value);
    const row = el.closest('.adm-row');
    const back = guestRowEl(g, x);                         // only this row, so a click elsewhere still lands
    row.replaceWith(back);
    if (el.dataset.cancel) back.querySelector(`[data-act="edit"][data-field="${field}"]`).focus();
    else if (value !== x[field] && (value || field !== 'name')) {  // a blank category or location clears it; a blank name doesn't
      mutate(() => api('PATCH', `/admin/guests/${x.id}`, { [field]: value }));
    }
  });

  async function moveGuest(x, target) {
    let groupId = Number(target);
    if (target === 'new') {
      const name = clean(window.prompt(`Name of the new group for ${x.name}:`, x.name) || '');
      if (!name) return;
      const created = await mutate(() => api('POST', '/admin/groups', { name }));
      if (!created) return;
      groupId = created.id;
    }
    state.expanded.add(groupId);
    const moved = await mutate(() => api('PATCH', `/admin/guests/${x.id}`, { group_id: groupId }), { reload: true });
    if (moved) say(`Moved ${x.name} to ${moved.name}.`);
  }

  list.addEventListener('submit', (e) => {
    const form = e.target;
    if (form.dataset.submit !== 'add-guest') return;
    e.preventDefault();
    const { g } = context(form);
    const input = form.querySelector('input');
    const name = clean(input.value);
    if (!g || !name) return;
    input.value = '';
    mutate(() => api('POST', `/admin/groups/${g.id}/guests`, { name }));
  });

  const copyLink = (g, btn) => copyUrl(linkFor(g), btn);
  async function copyUrl(url, btn) {
    if (btn.dataset.copying) return;                       // a second tap while it still says "Copied" would keep that as its label
    btn.dataset.copying = '1';
    const label = [...btn.childNodes];                     // text, or an icon in the guests view
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch (e) {                                          // older browsers, or plain http on another device
      const ta = h('textarea', { class: 'adm-offscreen', readonly: true });
      ta.value = url;
      panel.append(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
    }
    if (!ok) { delete btn.dataset.copying; window.prompt('Copy this link:', url); return; }
    btn.replaceChildren(btn.classList.contains('adm-icon') ? icon('check') : 'Copied');
    btn.classList.add('is-done');
    setTimeout(() => { btn.replaceChildren(...label); btn.classList.remove('is-done'); delete btn.dataset.copying; }, 1600);
  }

  /* ----- toolbar ----- */
  search.addEventListener('input', () => { state.query = search.value; renderList(); });
  if (isRoot) {
    filter.addEventListener('change', () => { state.filter = filter.value; renderList(); });
    catFilter.addEventListener('change', () => { state.category = catFilter.value; renderList(); });
    locFilter.addEventListener('change', () => { state.location = locFilter.value; renderList(); });
    sortBy.addEventListener('change', () => { state.sort = sortBy.value; renderList(); });
    views.addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]');
      if (b && b.dataset.view !== state.view) setView(b.dataset.view);
    });

    newForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = clean(newName.value);
      if (!name) { newName.focus(); return; }
      const g = await mutate(() => api('POST', '/admin/groups', { name }), { reload: true });
      if (!g) return;
      newName.value = '';
      setMenu(false);
      state.query = search.value = '';
      state.filter = 'all';
      state.expanded.add(g.id);
      setView('groups');
      const node = list.querySelector(`[data-group="${g.id}"]`);
      if (node) {
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        node.querySelector('.adm-add input').focus({ preventScroll: true });
      }
    });

    menuBtn.addEventListener('click', () => setMenu(menu.hidden));
    panel.addEventListener('click', (e) => { if (!menu.hidden && !menuWrap.contains(e.target)) setMenu(false); });

    clearBtn.addEventListener('click', async () => {
      setMenu(false);
      const guests = state.groups.reduce((n, g) => n + g.guests.length, 0);
      if (!state.groups.length) { say('The list is already empty.'); return; }
      const answer = window.prompt(
        `This permanently deletes all ${plural(guests, 'guest')} in ${plural(state.groups.length, 'group')}, with their RSVPs and sent status. ` +
        'Links you have already sent will stop working, and re-imported groups get new links.\n\n' +
        'To keep a copy first, cancel and run “make export-db”.\n\nType delete to continue:');
      if (clean(answer || '').toLowerCase() !== 'delete') return;
      const r = await mutate(() => api('POST', '/admin/clear', { confirm: 'delete' }), { reload: true });
      if (!r) return;
      state.expanded.clear();
      say(`Cleared ${plural(r.guests_deleted, 'guest')} in ${plural(r.groups_deleted, 'group')}. Import a new list when you’re ready.`);
    });

    importBtn.addEventListener('click', () => { setMenu(false); fileInput.click(); });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      if (file.size > 1_000_000) { say('That file is too big (1 MB at most).', true); return; }
      const text = await file.text();
      if (text.includes('�')) {
        say('That file isn’t saved as UTF-8, so accented names would come out garbled. In Excel, use Save As → “CSV UTF-8”.', true);
        return;
      }
      const r = await mutate(() => api('POST', '/admin/import', { csv: text }), { reload: true });
      if (!r) return;
      let msg = `Added ${plural(r.guests_added, 'guest')}`;
      if (r.groups_created) msg += ` in ${plural(r.groups_created, 'new group')}`;
      msg += '.';
      if (r.guests_updated) msg += ` Updated the guest category or location for ${plural(r.guests_updated, 'guest')} already on the list.`;
      if (r.guests_skipped) msg += ` Skipped ${r.guests_skipped} already on the list.`;
      if (r.rows_ignored) msg += ` Ignored ${plural(r.rows_ignored, 'row')} with no name.`;
      say(msg);
    });
  }

  /* ----- closing ----- */
  let closed = false;
  const handle = { close };
  function onKey(e) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (isRoot && !menu.hidden) { setMenu(false); menuBtn.focus(); return; }  // Escape closes the menu first
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    close();
  }
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    if (layoutEditor) layoutEditor.dispose();             // and its Compare versions, if it's open
    panel.classList.remove('is-open');
    setTimeout(() => panel.remove(), 400);
    if (current === handle) current = null;
  }
  document.addEventListener('keydown', onKey);
  closeBtn.addEventListener('click', close);
  signOutBtn.addEventListener('click', async () => {
    try { await api('POST', '/auth/logout'); } catch (e) { /* closing anyway */ }
    close();
  });

  refresh().catch(fail);
  return handle;
}

/* ---------- the Letter style view ----------
   The envelope's look. The preview is a copy of the card's own envelope, drawn from the same colours and
   patterns (window.cardStyle in index.html), so every change shows at once. It changes the card on this
   device too, until the page is reloaded, so "See it on the card" can show it arrive. Like the card's layout,
   the look is kept in versions: guests see the live one, and a version's changes reach them once it's saved
   (or once it's made live). */
const STYLE_KEYS = ['colour', 'pattern', 'finish', 'strength', 'crease', 'seal', 'seal_size'];
const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, String(v));
  for (const c of children.flat(Infinity)) if (c) el.append(c);
  return el;
}
/* ?look=… on a card link draws it in a style that isn't saved (LOOK in index.html) */
const lookParam = (s) => [s.colour.slice(1), s.pattern, s.finish, Math.round(s.strength * 100), s.crease, s.seal, Math.round(s.seal_size * 100)].join('-');

/* a copy of the card's envelope, without ids, its flap able to open */
function envelopeCopy() {
  const source = document.getElementById('env');
  if (!source) return null;
  const env = source.cloneNode(true);
  for (const el of [env, ...env.querySelectorAll('[id]')]) el.removeAttribute('id');
  env.querySelectorAll('defs').forEach((d) => d.remove());          // the seal's gradients: the card's own are used
  for (const el of env.querySelectorAll('.letter, .flap, .flap-inner, .seal')) el.removeAttribute('style');   // left by the card's animations
  env.classList.add('adm-env');
  const flap = env.querySelector('.flap'), inner = env.querySelector('.flap-inner');
  let timer = 0;
  return {
    el: env,
    setOpen(open) {
      clearTimeout(timer);
      inner.style.transform = open ? 'rotateX(180deg)' : '';
      /* once it's past upright it goes behind the paper, as on the card */
      if (open) timer = setTimeout(() => { flap.style.zIndex = '0'; }, 430);
      else flap.style.zIndex = '';
    }
  };
}

function createStyleEditor({ say, fail, close, copyUrl, base }) {
  const card = window.cardStyle;
  if (!card) return { el: h('p', { class: 'adm-empty' }, 'Reload the page to choose the letter’s style.'), load() {} };
  const st = {
    versions: null,                                       // every version, oldest first, as the backend has them
    id: null,                                             // the one being edited...
    trying: card.current(),                               // ... and its look as it is here, saved or not
    open: false,
    busy: false
  };
  const same = (a, b, keys = STYLE_KEYS) => !!a && !!b && keys.every((k) => String(a[k]) === String(b[k]));
  const version = () => (st.versions || []).find((v) => v.id === st.id) || null;
  const liveVersion = () => (st.versions || []).find((v) => v.live) || null;
  const isDirty = () => !!version() && !same(st.trying, version().style);
  const btn = (cls, act, label, attrs = {}) => h('button', { type: 'button', class: cls, 'data-style-act': act, ...attrs }, label);
  const LOOK_KEYS = STYLE_KEYS.filter((k) => k !== 'seal_size');   // a preset is a look; it keeps the seal's size as it is
  const isPreset = (p, t) => same(p.style, t, LOOK_KEYS);
  const labelOf = (group, value) => (STYLE_CHOICES[group].find((c) => c.value === value) || { label: value }).label;

  /* ----- the versions ----- */
  const verList = h('div', { class: 'adm-ver-list', role: 'group', 'aria-label': 'Versions' });
  const verState = h('p', { class: 'adm-ver-state' });
  const liveBtn = btn('adm-btn', 'live', 'Make live', { title: 'Every guest sees this version from their next visit' });
  const renameBtn = btn('adm-text-btn', 'rename', 'Rename');
  const deleteBtn = btn('adm-text-btn adm-danger', 'delete', 'Delete');
  const verSec = h('section', { class: 'adm-ver' },
    h('div', { class: 'adm-ver-head' }, h('h3', { class: 'adm-style-h' }, 'Versions')),
    verList,
    h('div', { class: 'adm-ver-bar' }, verState, h('div', { class: 'adm-ver-acts' }, renameBtn, deleteBtn, liveBtn)));

  /* ----- the preview ----- */
  const copy = envelopeCopy();
  const flapBtn = h('button', { type: 'button', class: 'adm-text-btn', 'data-style-act': 'flap' }, 'Open the flap');
  const stage = h('div', { class: 'adm-env-stage', title: 'Click to open or close the flap' }, copy && copy.el);
  const caption = h('p', { class: 'adm-style-caption' });
  const previewCol = h('div', { class: 'adm-style-preview' }, stage, h('div', { class: 'adm-style-under' }, caption, flapBtn));

  /* the patterns, drawn small from the card's own, through masks of their own */
  const masks = svg('svg', { class: 'adm-defs', width: 0, height: 0, 'aria-hidden': 'true' }, svg('defs', null,
    STYLE_CHOICES.pattern.map((p) => svg('mask', { id: `admMotif-${p.value}`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 700, height: 500 },
      svg('use', { href: `#motif-${p.value}` })))));
  const patternArt = (value) => svg('svg', { class: 'adm-st-chip-art', viewBox: value === 'corners' ? '0 0 700 500' : '350 0 350 250',
                                             preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' },
    svg('rect', { width: 700, height: 500, style: 'fill:var(--env-flap-a)' }),
    svg('rect', { width: 700, height: 500, style: 'fill:var(--foil-a)', mask: `url(#admMotif-${value})` }));
  /* a piece of the flap's edge with the trim along it */
  const creaseArt = (value) => svg('svg', { class: 'adm-st-chip-art', viewBox: '96 66 132 88', 'aria-hidden': 'true' },
    svg('rect', { width: 700, height: 500, style: 'fill:var(--env-side-l-b)' }),
    svg('path', { d: 'M0 0 H700 L388 266 Q350 298 312 266 Z', style: 'fill:var(--env-flap-a)' }),
    card.trim(value));
  const sealArt = () => h('span', { class: 'adm-seal-dot', 'aria-hidden': 'true' });
  /* a small envelope in a preset's colours */
  function miniEnvelope(s) {
    const c = (v) => card.shade(v, s.colour);
    const [light, mid, dark] = card.sealShades(s.seal, s.colour);
    return svg('svg', { class: 'adm-st-mini', viewBox: '0 0 70 50', 'aria-hidden': 'true' },
      svg('rect', { width: 70, height: 50, fill: c('--env-side-r-b') }),
      svg('path', { d: 'M0 0 L35 26 L0 50Z', fill: c('--env-side-l-a') }),
      svg('path', { d: 'M0 50 L35 23 L70 50Z', fill: c('--env-bottom-b') }),
      svg('path', { d: 'M0 0 H70 L35 28.5Z', fill: c('--env-flap-a') }),
      s.crease !== 'none' && svg('path', { d: 'M2 1.2 L35 26.6 L68 1.2', fill: 'none', stroke: '#d9bd7a', 'stroke-width': 0.7 }),
      svg('circle', { cx: 35, cy: 27, r: 6, fill: mid, stroke: dark, 'stroke-width': 0.8 }),
      svg('circle', { cx: 33.6, cy: 25.6, r: 2.2, fill: light, opacity: 0.55 }));
  }

  /* ----- the controls ----- */
  const section = (title, ...body) => h('section', { class: 'adm-style-sec' }, h('h3', { class: 'adm-style-h' }, title), ...body);
  const GROUP_NAMES = { pattern: 'Pattern', finish: 'Pattern in', crease: 'Along the creases', seal: 'Seal' };
  const chips = (group, art) => h('div', { class: 'adm-st-chips', role: 'group', 'aria-label': GROUP_NAMES[group] },
    STYLE_CHOICES[group].map((c) => h('button', { type: 'button', class: 'adm-st-chip', 'data-style': group, 'data-value': c.value,
                                                   'aria-pressed': 'false', title: c.note || null },
      art && art(c.value), h('span', { class: 'adm-st-chip-label' }, c.label))));
  const presets = STYLE_PRESETS.map((p, i) => h('button', { type: 'button', class: 'adm-preset', 'data-preset': i, 'aria-pressed': 'false' },
    miniEnvelope(p.style),
    h('span', { class: 'adm-preset-text' }, h('span', { class: 'adm-preset-name' }, p.name), h('span', { class: 'adm-preset-note' }, p.note))));
  const swatches = STYLE_SHADES.map((s) => h('button', { type: 'button', class: 'adm-swatch', 'data-colour': s.colour, 'aria-pressed': 'false' },
    h('span', { class: 'adm-swatch-dot', style: `background:${s.colour}`, 'aria-hidden': 'true' }), h('span', { class: 'adm-swatch-name' }, s.name)));
  const range = (key, label, min, max) => {
    const input = h('input', { type: 'range', class: 'adm-range', min, max, step: 1, 'data-range': key, 'aria-label': label });
    const out = h('output', { class: 'adm-range-val', 'aria-hidden': 'true' });
    return { input, out, row: h('label', { class: 'adm-range-row' }, h('span', { class: 'adm-range-label' }, label), input, out) };
  };
  const hue = range('h', 'Hue', 0, 359), rich = range('s', 'Richness', 0, 100), lightness = range('l', 'Lightness', 8, 60);
  const strength = range('strength', 'Strength', 20, 100);
  const sealSize = range('seal_size', 'Size', 60, 150);
  const hexIn = h('input', { type: 'text', class: 'adm-input adm-hex', maxlength: 7, spellcheck: 'false', autocomplete: 'off',
                             'aria-label': 'Colour as a hex code' });
  const picker = h('input', { type: 'color', class: 'adm-picker', 'aria-label': 'Pick any colour', title: 'Pick any colour' });
  const finish = chips('finish');
  const sealChips = chips('seal', sealArt);

  const status = h('p', { class: 'adm-style-status', role: 'status', 'aria-live': 'polite' });
  const undoBtn = btn('adm-text-btn', 'undo', 'Discard changes');
  const linkBtn = h('button', { type: 'button', class: 'adm-text-btn', 'data-style-act': 'link',
                                title: 'A link to the card in this style, to send to each other. It doesn’t save anything.' }, 'Copy a preview link');
  const seeBtn = h('button', { type: 'button', class: 'adm-btn adm-btn-quiet', 'data-style-act': 'see',
                               title: 'Close this and choose a language to watch the envelope arrive' }, 'See it on the card');
  const copyBtn = btn('adm-btn adm-btn-quiet', 'save-new', 'Save as new version', { title: 'Keep this as a version of its own' });
  const saveBtn = btn('adm-btn', 'save', 'Save');

  const controls = h('div', { class: 'adm-style-controls' },
    section('Starting points', h('div', { class: 'adm-presets' }, presets)),
    section('Colour',
      h('div', { class: 'adm-swatches' }, swatches),
      h('div', { class: 'adm-ranges' }, hue.row, rich.row, lightness.row),
      h('div', { class: 'adm-hex-row' }, picker, hexIn, h('span', { class: 'adm-hint adm-hex-hint' }, 'The flap’s colour; the rest of the envelope follows it.'))),
    section('Pattern', chips('pattern', patternArt),
      h('div', { class: 'adm-style-sub' }, h('span', { class: 'adm-style-sublabel' }, 'In'), finish, strength.row)),
    section('Along the creases', chips('crease', creaseArt)),
    section('Seal', sealChips, h('div', { class: 'adm-style-sub adm-seal-size' }, sealSize.row)));
  const foot = h('div', { class: 'adm-style-foot' }, status, h('div', { class: 'adm-style-actions' }, undoBtn, linkBtn, seeBtn, copyBtn, saveBtn));
  const el = h('div', { class: 'adm-style' }, masks, verSec, previewCol, controls, foot);

  /* ----- showing the style being tried ----- */
  function paintRanges() {
    const [H, S, L] = [+hue.input.value, +rich.input.value, +lightness.input.value];
    hue.input.style.setProperty('--track', `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((x) => `hsl(${x} ${S}% ${L}%)`).join(', ')})`);
    rich.input.style.setProperty('--track', `linear-gradient(to right, hsl(${H} 0% ${L}%), hsl(${H} 100% ${L}%))`);
    lightness.input.style.setProperty('--track', `linear-gradient(to right, hsl(${H} ${S}% 8%), hsl(${H} ${S}% 60%))`);
    hue.out.textContent = `${H}°`;
    rich.out.textContent = `${S}%`;
    lightness.out.textContent = `${L}%`;
  }
  let versionsShown = '';
  function renderVersions(dirty) {
    const key = JSON.stringify([(st.versions || []).map((v) => [v.id, v.name, v.live]), st.id, dirty, st.busy]);
    if (key === versionsShown) return;
    versionsShown = key;
    const focused = verList.contains(document.activeElement) ? document.activeElement.dataset.version : null;
    verList.replaceChildren(...(st.versions || []).map((v) => h('button', {
      type: 'button', class: `adm-ver-chip${v.live ? ' is-live' : ''}`, 'data-version': v.id, 'aria-pressed': String(v.id === st.id),
      title: v.live ? 'Guests see this version' : null
    }, h('span', { class: 'adm-ver-name' }, v.name),
      v.live && h('span', { class: 'adm-live' }, 'Live'),
      v.id === st.id && dirty && h('span', { class: 'adm-ver-dirty', title: 'Unsaved changes', 'aria-label': '(unsaved changes)' }, '•'))),
    btn('adm-ver-chip adm-ver-new', 'new', '+ New version', { title: 'A version of its own, starting from the original envelope', disabled: st.busy }));
    if (focused) { const b = verList.querySelector(`[data-version="${focused}"]`); if (b) b.focus({ preventScroll: true }); }
  }
  function sync({ fromRanges = false } = {}) {
    const t = st.trying;
    for (const b of el.querySelectorAll('[data-style]')) b.setAttribute('aria-pressed', String(String(t[b.dataset.style]) === b.dataset.value));
    for (const b of presets) b.setAttribute('aria-pressed', String(isPreset(STYLE_PRESETS[b.dataset.preset], t)));
    for (const b of swatches) b.setAttribute('aria-pressed', String(b.dataset.colour === t.colour));
    if (!fromRanges) {
      const [H, S, L] = card.toHsl(t.colour);
      hue.input.value = Math.round(H);
      rich.input.value = Math.round(S * 100);
      lightness.input.value = Math.round(L * 100);
    }
    paintRanges();
    if (document.activeElement !== hexIn) hexIn.value = t.colour;
    picker.value = t.colour;
    strength.input.value = Math.round(t.strength * 100);
    strength.out.textContent = `${strength.input.value}%`;
    sealSize.input.value = Math.round(t.seal_size * 100);
    sealSize.out.textContent = `${sealSize.input.value}%`;
    el.classList.toggle('is-plain', t.pattern === 'none');   // nothing to finish or strengthen
    for (const b of sealChips.querySelectorAll('[data-value]')) {
      const [light, mid, dark] = card.sealShades(b.dataset.value, t.colour);
      b.querySelector('.adm-seal-dot').style.background = `radial-gradient(circle at 36% 32%, ${light}, ${mid} 48%, ${dark})`;
    }
    const preset = STYLE_PRESETS.find((p) => isPreset(p, t));
    caption.textContent = [preset && preset.name, labelOf('pattern', t.pattern), t.crease !== 'none' && labelOf('crease', t.crease),
                           `${labelOf('seal', t.seal).toLowerCase()} seal`].filter(Boolean).join(' · ');
    el.classList.toggle('is-busy', st.busy);
    const v = version(), live = liveVersion(), dirty = isDirty();
    verSec.hidden = !v;
    if (v) {
      renderVersions(dirty);
      verState.textContent = v.live ? `Guests see “${v.name}”.` : `Guests see “${live ? live.name : '…'}”, not this version.`;
      liveBtn.hidden = v.live;
      liveBtn.disabled = renameBtn.disabled = st.busy;
      deleteBtn.disabled = st.busy || v.live;
      deleteBtn.title = v.live ? 'Guests see this version: make another live before deleting it' : null;
    }
    status.textContent = !v ? '' : dirty
      ? (v.live ? 'Unsaved changes, only on this screen: guests see this version as it was last saved.' : 'Unsaved changes.')
      : v.live ? 'Guests see this envelope.' : 'All changes saved.';
    status.classList.toggle('is-unsaved', dirty);
    saveBtn.disabled = undoBtn.disabled = st.busy || !dirty;
    copyBtn.disabled = st.busy || !v;
  }
  function tryStyle(patch, opts) {
    st.trying = card.apply({ ...st.trying, ...patch });
    sync(opts);
  }
  function setOpen(open) {
    st.open = open;
    stage.classList.toggle('is-open', open);
    if (copy) copy.setOpen(open);
    flapBtn.textContent = open ? 'Close the flap' : 'Open the flap';
  }

  /* ----- the versions: saving, switching, making live ----- */
  /* opens a version: its saved look, or `trying` (its unsaved changes from before) */
  function open(id, trying = null) {
    st.id = id;
    st.trying = card.apply(trying || version().style);
    sync();
  }
  /* one request at a time; the buttons wait for it */
  async function request(send) {
    if (st.busy) return undefined;
    st.busy = true;
    sync();
    try { return await send(); } catch (err) { fail(err); return undefined; } finally { st.busy = false; sync(); }
  }
  const leave = () => !isDirty() || window.confirm(`Discard your unsaved changes to “${version().name}”?`);
  const askName = (message, suggestion) => clean(window.prompt(message, suggestion) || '').slice(0, VERSION_NAME_MAX);
  async function makeLive() {
    const v = version();
    if (!v || v.live) return;
    const withChanges = isDirty();
    if (!window.confirm(withChanges ? `Save your changes to “${v.name}” and show it to every guest from their next visit?`
      : `Every guest will see “${v.name}” from their next visit. Make it live?`)) return;
    const list = await request(() => api('PATCH', `/admin/style-versions/${v.id}`, withChanges ? { style: st.trying, live: true } : { live: true }));
    if (!list) return;
    st.versions = list;
    open(v.id);
    say(`Guests now see “${v.name}”.`);
  }
  async function save() {
    const v = version();
    if (v.live && !window.confirm(`Guests see “${v.name}”. Save, so they see this envelope from their next visit?`)) return;
    const list = await request(() => api('PATCH', `/admin/style-versions/${v.id}`, { style: st.trying }));
    if (!list) return;
    st.versions = list;
    open(v.id);
    say(v.live ? `Saved. Guests now see the changes to “${v.name}”.` : `Saved “${v.name}”.`);
  }
  async function saveAsNew() {
    const v = version();
    const name = askName('Name the new version. It starts as this one is now, with any unsaved changes.', `${v.name} (copy)`);
    if (!name) return;
    const made = await request(() => api('POST', '/admin/style-versions', { name, style: st.trying }));
    if (!made) return;
    st.versions = [...st.versions, made];
    open(made.id);
    const live = liveVersion();
    say(`Saved as “${made.name}”.${live ? ` Guests still see “${live.name}”.` : ''}`);
  }
  async function newVersion() {
    if (!leave()) return;
    const name = askName('Name the new version. It starts from the original envelope.', `Version ${st.versions.length + 1}`);
    if (!name) return;
    const made = await request(() => api('POST', '/admin/style-versions', { name }));
    if (!made) return;
    st.versions = [...st.versions, made];
    open(made.id);
    say(`Made “${made.name}”. Guests won’t see it until it’s made live.`);
  }
  async function rename() {
    const v = version();
    const name = askName('A new name for this version:', v.name);
    if (!name || name === v.name) return;
    const list = await request(() => api('PATCH', `/admin/style-versions/${v.id}`, { name }));
    if (!list) return;
    st.versions = list;
    sync();
  }
  async function remove() {
    const v = version();
    if (v.live || !window.confirm(`Delete “${v.name}”? This can’t be undone.`)) return;
    const done = await request(() => api('DELETE', `/admin/style-versions/${v.id}`).then(() => true));
    if (!done) return;
    st.versions = st.versions.filter((x) => x.id !== v.id);
    open((liveVersion() || st.versions[0]).id);
    say(`Deleted “${v.name}”.`);
  }

  /* ----- what each control does ----- */
  el.addEventListener('click', async (e) => {
    const ver = e.target.closest('[data-version]');
    if (ver) {
      const id = Number(ver.dataset.version);
      if (!st.busy && id !== st.id && leave()) open(id);
      return;
    }
    const pick = e.target.closest('[data-style]');
    if (pick) { tryStyle({ [pick.dataset.style]: pick.dataset.value }); return; }
    const preset = e.target.closest('[data-preset]');
    if (preset) { tryStyle(STYLE_PRESETS[preset.dataset.preset].style); return; }
    const swatch = e.target.closest('[data-colour]');
    if (swatch) { tryStyle({ colour: swatch.dataset.colour }); return; }
    if (e.target.closest('.adm-env-stage')) { setOpen(!st.open); return; }
    const act = e.target.closest('[data-style-act]');
    if (!act || act.disabled) return;
    switch (act.dataset.styleAct) {
      case 'flap': setOpen(!st.open); break;
      case 'undo': open(st.id); break;
      case 'link': copyUrl(`${base}/?to=Guest&look=${lookParam(st.trying)}`, act); break;
      case 'see': close(); break;
      case 'save': save(); break;
      case 'save-new': saveAsNew(); break;
      case 'new': newVersion(); break;
      case 'live': makeLive(); break;
      case 'rename': rename(); break;
      case 'delete': remove(); break;
    }
  });
  el.addEventListener('input', (e) => {
    const key = e.target.dataset && e.target.dataset.range;
    if (key === 'strength') tryStyle({ strength: +e.target.value / 100 });
    else if (key === 'seal_size') tryStyle({ seal_size: +e.target.value / 100 });
    else if (key) tryStyle({ colour: card.toHex(+hue.input.value, +rich.input.value / 100, +lightness.input.value / 100) }, { fromRanges: true });
    else if (e.target === picker) tryStyle({ colour: picker.value });
  });
  const typedHex = () => {
    const v = hexIn.value.trim().replace(/^#?/, '#').toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v)) tryStyle({ colour: v }); else hexIn.value = st.trying.colour;
  };
  hexIn.addEventListener('change', typedHex);
  hexIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); typedHex(); hexIn.select(); } });

  sync();
  return {
    el,
    /* the versions, fresh each time the view is shown; a version with unsaved changes keeps them */
    async load() {
      let versions;
      try {
        versions = await api('GET', '/admin/style-versions');
      } catch (err) { fail(err); return; }
      const kept = isDirty() ? st.trying : null;
      const wanted = st.id;
      st.versions = versions;
      const target = versions.find((v) => v.id === wanted) || versions.find((v) => v.live) || versions[0];
      if (!target) return;
      open(target.id, target.id === wanted ? kept : null);
    }
  };
}

/* ---------- the Card layout view ----------
   Versions of the card's layout: where each piece of text on its cover (the "Dear …" side) and on the save the
   date sits, how big it is, and what it says in each language. The preview is a copy of the card's own side,
   drawn as the card draws itself (window.cardLayout in index.html): click a piece of text to pick it, then drag
   it, nudge it with the arrow keys or use the sliders; double-click it (or type in Words) to change its words.
   Clicking the card away from the text, or Escape, picks nothing, so the card shows without outlines.
   Each version is kept in the database and guests see the live one. Like the Letter style view, the version
   being edited shows on this device's card straight away, until the page is reloaded. */
const SIDES = [
  { value: 'cover', label: 'Dear guest' },
  { value: 'save_the_date', label: 'Save the date' }
];
const LANG_NAMES = { en: 'English', vi: 'Tiếng Việt', 'zh-Hant': '中文' };
const PIECE_NAMES = {
  cover: { xi: '囍', dear: 'Dear', names: 'Guests’ names' },
  save_the_date: { title: 'Save the date', lead: 'For the wedding of', names: 'Names', day: 'Date', place: 'Place', note: 'Invitation to follow' }
};
const SNAP = 0.8;                                         // card units from the centre line that snap onto it
const LINES_MAX = 4;                                      // as the backend's PIECE_LINES_MAX
const VERSION_NAME_MAX = 60;                              // and VERSION_NAME_MAX
const SAMPLE_NAMES = 'Guest';                             // who the cover greets in the preview, until another is typed
/* what the view was showing, kept while the page is open: closing the panel to see the card and coming back
   finds the same version, side and unsaved changes */
let layoutMemory = null;

/* a piece's words as the backend keeps them: each line's spaces tidied, blank lines dropped */
const tidyWords = (text, max) => String(text).split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/)
  .map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, LINES_MAX).join('\n').slice(0, max).trim();

/* the characters the card's typefaces have (frontend/tools/subset_fonts.py); anything else is drawn in another
   face. The script the couple's names are in has only their letters; the Chinese face, only the characters
   index.html has, which is fetched the first time it's needed */
const SCRIPT_CHARS = new Set('Ivan Sam&Ana Nguyen\u1ec5');   // ễ: Nguyễn, as the Vietnamese card writes it
const LATIN = [[0x20, 0x7e], [0xa0, 0x17f], [0x1a0, 0x1a1], [0x1af, 0x1b0], [0x2bb, 0x2bc], [0x300, 0x301], [0x303, 0x304],
  [0x308, 0x309], [0x323, 0x323], [0x329, 0x329], [0x1ea0, 0x1ef9], [0x2013, 0x2014], [0x2018, 0x2019], [0x201c, 0x201d],
  [0x2022, 0x2022], [0x2026, 0x2026], [0x20ab, 0x20ab], [0x3000, 0x3011], [0xff01, 0xff01], [0xff08, 0xff09], [0xff0c, 0xff0c],
  [0xff1a, 0xff1b], [0xff1f, 0xff1f]];
const isCjk = (c) => (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff);
let pageCjk = null;
function loadPageCjk() {
  pageCjk ||= fetch('/', { credentials: 'same-origin' }).then((r) => r.text())
    .then((t) => new Set(t.match(/[\u2e80-\u9fff\uf900-\ufaff]/gu) || []))
    .catch(() => null);
  return pageCjk;
}
/* the characters in text that the piece's typeface doesn't have */
function strangers(face, piece, text, cjk) {
  const out = [];
  for (const ch of new Set(text.replace(/\s/g, ''))) {
    const c = ch.codePointAt(0);
    const ok = face === 'save_the_date' && piece === 'names' ? SCRIPT_CHARS.has(ch)
      : isCjk(c) ? !cjk || cjk.has(ch)
      : LATIN.some(([a, b]) => c >= a && c <= b);
    if (!ok) out.push(ch);
  }
  return out;
}

/* a copy of the card's save the date: its words where they settle, and the ducklings beside them, which can't
   be reached or clicked */
function saveTheDateCopy() {
  const back = document.getElementById('backFace');
  const std = back && back.querySelector('[data-letter="save_the_date"]');
  if (!std) return [];
  return [std, ...back.querySelectorAll('[data-on-letter~="save_the_date"]')].map((el) => {
    const c = el.cloneNode(true);
    c.hidden = false;
    for (const n of [c, ...c.querySelectorAll('.rv, [id], a[href]')]) {
      n.classList.remove('rv');
      n.removeAttribute('id');
      n.removeAttribute('href');
    }
    c.removeAttribute('data-letter');
    c.removeAttribute('data-on-letter');
    if (!c.matches('[data-face]')) { c.inert = true; c.classList.add('adm-std-context'); }
    return c;
  });
}
/* a copy of one side of the card, made from its own markup: the cover (greeted by card.greet) or the save the date */
function faceCopy(face) {
  if (face !== 'cover') return saveTheDateCopy();
  const print = document.getElementById('coverPrint');
  if (!print) return [];
  const c = print.cloneNode(true);
  for (const n of [c, ...c.querySelectorAll('[id]')]) n.removeAttribute('id');
  c.querySelector('.cover-art').classList.remove('is-blank');
  return [c];
}
/* a side drawn as the card draws itself (layout() in index.html): w pixels wide, card.across units across,
   in its own proportions (the save the date's height is the layout's) */
function sizeFace(card, sheet, w, face, opens, layout) {
  sheet.style.setProperty('--wf', `${w}px`);
  sheet.style.setProperty('--u', `${w / card.across}px`);
  sheet.style.setProperty('--hh', `${w / card.shape(face, opens, layout)}px`);
}
/* one side in a layout and language, w pixels wide, to look at only */
function faceSheet(card, face, layout, lang, w, opens, names) {
  const sheet = h('div', { class: 'adm-std-sheet adm-face-sheet paper', lang }, faceCopy(face));
  sheet.inert = true;
  if (face === 'cover') card.greet(sheet, names, lang);
  sizeFace(card, sheet, w, face, opens, layout);
  card.paint(sheet, layout, lang);
  return sheet;
}

function createLayoutEditor({ say, fail, close }) {
  const card = window.cardLayout;
  if (!card || !card.faces || !document.getElementById('backFace')) {
    return { el: h('p', { class: 'adm-empty' }, 'Reload the page to lay out the card.'), load() {}, dispose() {} };
  }
  const LIMITS = card.limits;
  const mem = layoutMemory || {};
  const pageLang = document.documentElement.lang;
  const st = {
    versions: null,                                       // every version, oldest first, as the backend has them
    id: null,                                             // the one being edited...
    draft: null,                                          // ... and its layout as it is here, saved or not
    face: mem.face || 'save_the_date',
    lang: mem.lang || (card.langs.includes(pageLang) ? pageLang : 'en'),
    selected: mem.selected !== undefined ? mem.selected : 'names',   // null: nothing picked, so no outlines
    sample: mem.sample || SAMPLE_NAMES,
    opens: null,                                          // the letter guests' cards open on: the cover takes its shape
    cjk: null,
    drag: null,
    editing: null,                                        // the piece being typed into on the card...
    before: null,                                         // ... and its words before, for Escape
    busy: false
  };
  const json = (x) => JSON.stringify(x);
  const round = (v, step) => Math.round(v / step) * step;
  const version = () => (st.versions || []).find((v) => v.id === st.id) || null;
  const liveVersion = () => (st.versions || []).find((v) => v.live) || null;
  const savedLayout = () => (version() ? card.normal(version().layout) : null);
  const isDirty = () => !!version() && !!st.draft && json(st.draft) !== json(savedLayout());
  const isChanged = (p) => p.x !== 0 || p.y !== 0 || p.size !== 1 || p.bold || p.italic || (!!p.text && Object.keys(p.text).length > 0);
  const nameOf = (key, face = st.face) => PIECE_NAMES[face][key] || key;
  const sideName = (face) => SIDES.find((s) => s.value === face).label;
  const sampleNames = () => {
    const names = st.sample.split(/\s*(?:,|&|\band\b)\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 10);
    return names.length ? names : [SAMPLE_NAMES];
  };
  const btn = (cls, act, label, attrs = {}) => h('button', { type: 'button', class: cls, 'data-layout-act': act, ...attrs }, label);

  /* ----- the versions ----- */
  const verList = h('div', { class: 'adm-ver-list', role: 'group', 'aria-label': 'Versions' });
  const verState = h('p', { class: 'adm-ver-state' });
  const liveBtn = btn('adm-btn', 'live', 'Make live', { title: 'Every guest sees this version from their next visit' });
  const renameBtn = btn('adm-text-btn', 'rename', 'Rename');
  const deleteBtn = btn('adm-text-btn adm-danger', 'delete', 'Delete');
  const compareBtn = btn('adm-btn adm-btn-quiet', 'compare', 'Compare versions', { title: 'Every version side by side, at full size' });
  const verSec = h('section', { class: 'adm-ver' },
    h('div', { class: 'adm-ver-head' }, h('h3', { class: 'adm-style-h' }, 'Versions'), compareBtn),
    verList,
    h('div', { class: 'adm-ver-bar' }, verState, h('div', { class: 'adm-ver-acts' }, renameBtn, deleteBtn, liveBtn)));

  /* ----- which side, in which language ----- */
  const sides = h('div', { class: 'adm-views adm-sides', role: 'group', 'aria-label': 'Side of the card' },
    SIDES.map((s) => h('button', { type: 'button', class: 'adm-view', 'data-side': s.value, 'aria-pressed': 'false' }, s.label)));
  const langs = h('div', { class: 'adm-rsvp adm-langs', role: 'group', 'aria-label': 'Language' },
    card.langs.map((c) => h('button', { type: 'button', class: 'adm-seg is-pick', 'data-show-lang': c, lang: c, 'aria-pressed': 'false' },
      LANG_NAMES[c] || c)));
  const bar = h('div', { class: 'adm-face-bar' }, sides, langs);

  /* ----- the preview ----- */
  const sheet = h('div', { class: 'adm-std-sheet paper', role: 'group' });
  const guide = h('i', { class: 'adm-std-guide', 'aria-hidden': 'true' });
  const stage = h('div', { class: 'adm-std-stage' }, sheet);
  const scaleNote = h('p', { class: 'adm-style-caption adm-std-scale' });
  const hint = h('p', { class: 'adm-style-caption adm-std-hint' },
    'Click a piece of text to pick it, then drag it or nudge it with the arrow keys (Shift for bigger steps, + and − for its size, ',
    '⌘B / ⌘I for bold and italics). Double-click it, or press Enter, to change its words. ',
    'Click the card away from the text, or press Esc, to see it without outlines.');
  const deselectBtn = btn('adm-text-btn', 'deselect', 'Deselect', { title: 'See the card without outlines (Esc)' });
  const previewCol = h('div', { class: 'adm-style-preview adm-std-preview' }, stage,
    h('div', { class: 'adm-style-under' }, scaleNote, hint, deselectBtn));
  const fullUnit = card.widest / card.across;             // pixels in one card unit, on a big screen
  let unit = fullUnit;                                    // ... and in the preview
  let sheetW = card.widest;                               // the preview's width in pixels
  function fit() {
    const room = stage.clientWidth || card.widest;
    const w = Math.round(Math.max(240, Math.min(room, card.widest)));
    unit = w / card.across;
    sheetW = w;
    sizeFace(card, sheet, w, st.face, st.opens, st.draft);
    const pct = Math.round((w / card.widest) * 100);
    scaleNote.textContent = pct >= 99 ? 'Actual size: as the card is on a computer screen.'
      : `Shown at ${pct}% of its size on a computer screen; the text keeps the same size against the card.`;
    if (st.draft) { paint(); sync(); }
  }
  const resize = new ResizeObserver(fit);
  resize.observe(stage);
  const pieceEl = (key) => sheet.querySelector(`.adm-piece[data-piece="${key}"]`);
  /* fresh for each side and language: the cover greets its sample guests in the language shown */
  function build() {
    sheet.replaceChildren(...faceCopy(st.face), guide);
    sheet.lang = st.lang;
    sheet.setAttribute('aria-label', st.face === 'cover' ? 'The card’s cover' : 'The save the date');
    if (st.face === 'cover') card.greet(sheet, sampleNames(), st.lang);
    for (const n of sheet.querySelectorAll('[data-face] [data-piece]')) {
      const words = card.rewordable(st.face, n.dataset.piece);
      n.tabIndex = 0;
      n.setAttribute('role', 'button');
      n.setAttribute('aria-label', `${nameOf(n.dataset.piece)}: drag, or use the arrow keys, to move it${words ? '; press Enter to change its words' : ''}`);
      n.classList.add('adm-piece');
    }
    pickers.replaceChildren(...card.faces[st.face].map((k) =>
      h('button', { type: 'button', class: 'adm-st-chip adm-piece-chip', 'data-pick': k, 'aria-pressed': 'false' },
        h('span', { class: 'adm-st-chip-label' }, nameOf(k)))));
    fit();
  }

  /* ----- the picked piece ----- */
  const section = (title, ...body) => h('section', { class: 'adm-style-sec' }, h('h3', { class: 'adm-style-h' }, title), ...body);
  const pickers = h('div', { class: 'adm-st-chips adm-pieces', role: 'group', 'aria-label': 'Pieces of text' });
  const pieceTitle = h('h3', { class: 'adm-style-h' });
  const nonePicked = h('p', { class: 'adm-hint adm-piece-none' },
    'Nothing is picked, so the card shows just as guests see it. Click a piece of text on it, or pick one on the left, ',
    'to move it, size it or change its words.');
  const wordsLabel = h('span', { class: 'adm-range-label' });
  const wordsIn = h('textarea', { class: 'adm-input adm-words', rows: 2, maxlength: card.textMax, 'data-words': '1', autocomplete: 'off' });
  const wordsNote = h('p', { class: 'adm-hint adm-words-note', 'aria-live': 'polite' });
  const ownBtn = btn('adm-text-btn', 'own-words', 'Use the card’s own words');
  const wordsRow = h('div', { class: 'adm-words-row' },
    h('label', { class: 'adm-words-field' }, wordsLabel, wordsIn),
    h('div', { class: 'adm-words-under' }, wordsNote, ownBtn));
  const sampleIn = h('input', { type: 'text', class: 'adm-input', maxlength: 300, autocomplete: 'off', 'data-sample': '1',
                                'aria-label': 'Names to greet in the preview' });
  const sampleRow = h('div', { class: 'adm-words-row' },
    h('label', { class: 'adm-words-field' }, h('span', { class: 'adm-range-label' }, 'Try with'), sampleIn),
    h('p', { class: 'adm-hint' }, 'Each guest’s card has the names on their link here. Separate names with commas to try a longer ',
      'greeting; this only changes the preview.'));
  const range = (key, label, min, max, step) => {
    const input = h('input', { type: 'range', class: 'adm-range', min, max, step, 'data-place': key, 'aria-label': label });
    const out = h('output', { class: 'adm-range-val', 'aria-hidden': 'true' });
    return { input, out, row: h('label', { class: 'adm-range-row' }, h('span', { class: 'adm-range-label' }, label), input, out) };
  };
  const across = range('x', 'Across', LIMITS.x[0], LIMITS.x[1], 0.5);
  const down = range('y', 'Up / down', LIMITS.y[0], LIMITS.y[1], 0.5);
  const size = range('size', 'Font size', LIMITS.size[0] * 100, LIMITS.size[1] * 100, 1);
  size.out.classList.add('adm-range-wide');
  const smaller = btn('adm-text-btn', 'smaller', 'A−', { title: 'One point smaller' });
  const bigger = btn('adm-text-btn', 'bigger', 'A+', { title: 'One point bigger' });
  /* a piece's font size in pixels on a big screen: its own size (from the stylesheet) times its size here */
  const basePx = (key) => {
    const n = pieceEl(key);
    const t = n && (n.querySelector('.xi') || n);          // the 囍's emblem is sized by the character in it
    return t ? (parseFloat(getComputedStyle(t).fontSize) / unit) * fullUnit : 0;
  };
  const centreBtn = btn('adm-text-btn', 'centre', 'Centre it');
  const resetBtn = btn('adm-text-btn', 'reset', 'Put it back', { title: 'Where the card first put it, in its own words' });
  const boldBtn = btn('adm-fmt adm-fmt-b', 'bold', 'B', { 'aria-pressed': 'false', title: 'Bold (⌘B / Ctrl+B)', 'aria-label': 'Bold' });
  const italicBtn = btn('adm-fmt adm-fmt-i', 'italic', 'I', { 'aria-pressed': 'false', title: 'Italics (⌘I / Ctrl+I)', 'aria-label': 'Italics' });
  const pieceBody = h('div', { class: 'adm-piece-body' }, wordsRow, sampleRow,
    h('div', { class: 'adm-ranges' }, across.row, down.row, size.row),
    h('div', { class: 'adm-style-sub' }, h('span', { class: 'adm-fmts', role: 'group', 'aria-label': 'Type' }, boldBtn, italicBtn),
      smaller, bigger, centreBtn, resetBtn));
  /* the save the date card's height (its cover's too, when guests' cards open on it); its width stays */
  const HEIGHT = LIMITS.std_height;
  const heightIn = h('input', { type: 'range', class: 'adm-range', min: HEIGHT[0] * 100, max: HEIGHT[1] * 100, step: 1,
                                'data-card-height': '1', 'aria-label': 'Card height' });
  const heightOut = h('output', { class: 'adm-range-val', 'aria-hidden': 'true' });
  const heightBack = btn('adm-text-btn', 'height-back', 'Original height');
  const heightNote = h('p', { class: 'adm-hint' });
  const heightSec = section('Card height',
    h('div', { class: 'adm-ranges' },
      h('label', { class: 'adm-range-row' }, h('span', { class: 'adm-range-label' }, 'Height'), heightIn, heightOut)),
    h('div', { class: 'adm-style-sub' }, heightBack),
    heightNote);
  const controls = h('div', { class: 'adm-style-controls' },
    heightSec,
    section('Pieces of text', pickers),
    h('section', { class: 'adm-style-sec' }, pieceTitle, nonePicked, pieceBody));

  /* ----- saving ----- */
  const status = h('p', { class: 'adm-style-status', role: 'status', 'aria-live': 'polite' });
  const allBtn = btn('adm-text-btn', 'all', 'Original layout', { title: 'Every piece on this side where the card first put it, in its own words' });
  const undoBtn = btn('adm-text-btn', 'discard', 'Discard changes');
  const seeBtn = btn('adm-btn adm-btn-quiet', 'see', 'See it on the card', { title: 'Close this and open the card to see it there' });
  const copyBtn = btn('adm-btn adm-btn-quiet', 'save-new', 'Save as new version', { title: 'Keep this as a version of its own' });
  const saveBtn = btn('adm-btn', 'save', 'Save');
  const foot = h('div', { class: 'adm-style-foot' }, status, h('div', { class: 'adm-style-actions' }, allBtn, undoBtn, seeBtn, copyBtn, saveBtn));
  const el = h('div', { class: 'adm-style adm-layout' }, verSec, bar, previewCol, controls, foot);

  /* ----- showing the version being edited ----- */
  function paint() {
    sizeFace(card, sheet, sheetW, st.face, st.opens, st.draft);
    card.paint(sheet, st.draft, st.lang);
  }
  function remember() {
    layoutMemory = { id: st.id, draft: st.draft, face: st.face, lang: st.lang, selected: st.selected, sample: st.sample };
  }
  /* after any change: the card on this device, the copy here, the controls */
  function show() {
    st.draft = card.normal(st.draft);
    card.apply(st.draft);
    paint();
    sync();
    remember();
  }
  /* opens a version: its saved layout, or `draft` (its unsaved changes from before) */
  function open(id, draft = null) {
    stopEditing(true);
    st.id = id;
    st.draft = card.normal(draft || version().layout);
    show();
  }
  let versionsShown = '';
  function renderVersions(dirty) {
    const key = json([(st.versions || []).map((v) => [v.id, v.name, v.live]), st.id, dirty, st.busy]);
    if (key === versionsShown) return;
    versionsShown = key;
    const focused = verList.contains(document.activeElement) ? document.activeElement.dataset.version : null;
    verList.replaceChildren(...(st.versions || []).map((v) => h('button', {
      type: 'button', class: `adm-ver-chip${v.live ? ' is-live' : ''}`, 'data-version': v.id, 'aria-pressed': String(v.id === st.id),
      title: v.live ? 'Guests see this version' : null
    }, h('span', { class: 'adm-ver-name' }, v.name),
      v.live && h('span', { class: 'adm-live' }, 'Live'),
      v.id === st.id && dirty && h('span', { class: 'adm-ver-dirty', title: 'Unsaved changes', 'aria-label': '(unsaved changes)' }, '•'))),
    btn('adm-ver-chip adm-ver-new', 'new', '+ New version', { title: 'A version of its own, starting from the card’s original layout', disabled: st.busy }));
    if (focused) { const b = verList.querySelector(`[data-version="${focused}"]`); if (b) b.focus({ preventScroll: true }); }
  }
  function sync() {
    const t = st.draft, v = version();
    el.classList.toggle('is-busy', st.busy);
    if (!t || !v) return;
    const dirty = isDirty(), live = liveVersion();
    renderVersions(dirty);
    verState.textContent = v.live ? `Guests see “${v.name}”.` : `Guests see “${live ? live.name : '…'}”, not this version.`;
    liveBtn.hidden = v.live;
    liveBtn.disabled = renameBtn.disabled = st.busy;
    deleteBtn.disabled = st.busy || v.live;
    deleteBtn.title = v.live ? 'Guests see this version: make another live before deleting it' : null;
    for (const b of sides.children) b.setAttribute('aria-pressed', String(b.dataset.side === st.face));
    for (const b of langs.children) b.setAttribute('aria-pressed', String(b.dataset.showLang === st.lang));
    for (const b of pickers.querySelectorAll('[data-pick]')) {
      b.setAttribute('aria-pressed', String(b.dataset.pick === st.selected));
      b.classList.toggle('is-moved', isChanged(t[st.face][b.dataset.pick]));
    }
    for (const n of sheet.querySelectorAll('.adm-piece')) n.classList.toggle('is-picked', n.dataset.piece === st.selected);
    sheet.classList.toggle('has-pick', !!st.selected);

    const key = st.selected, p = key ? t[st.face][key] : null;
    pieceTitle.textContent = p ? nameOf(key) : 'Nothing picked';
    nonePicked.hidden = !!p;
    pieceBody.hidden = !p;
    deselectBtn.disabled = !p;
    if (p) {
      const words = card.rewordable(st.face, key);
      wordsRow.hidden = !words;
      if (words) {
        const own = card.ownWords(st.face, key, st.lang);
        const value = typeof p.text[st.lang] === 'string' ? p.text[st.lang] : own;
        if (document.activeElement !== wordsIn) wordsIn.value = value;
        wordsLabel.textContent = words.same ? 'Words (the same in every language)' : `Words in ${LANG_NAMES[st.lang] || st.lang}`;
        wordsIn.setAttribute('aria-label', wordsLabel.textContent);
        ownBtn.disabled = !(words.same ? Object.keys(p.text).length : st.lang in p.text);
        const odd = strangers(st.face, key, value, st.cjk);
        wordsNote.textContent = !value ? 'Blank, so this piece is left off the card.'
          : odd.length ? `Not in the card’s typeface, so drawn in another: ${odd.join(' ')}` : '';
        wordsNote.classList.toggle('is-warn', !!value && odd.length > 0);
      }
      const isGuests = st.face === 'cover' && key === 'names';
      sampleRow.hidden = !isGuests;
      if (isGuests && document.activeElement !== sampleIn) sampleIn.value = st.sample;
      across.input.value = p.x;
      across.out.textContent = p.x > 0 ? `+${p.x}` : String(p.x);
      down.input.value = p.y;
      down.out.textContent = p.y > 0 ? `+${p.y}` : String(p.y);
      size.input.value = Math.round(p.size * 100);
      const px = basePx(key) * p.size;
      size.out.textContent = px ? `${px.toFixed(1)} px` : `${size.input.value}%`;
      size.out.title = `${size.input.value}% of its original size; in pixels as on a computer screen`;
      boldBtn.setAttribute('aria-pressed', String(p.bold));
      italicBtn.setAttribute('aria-pressed', String(p.italic));
      smaller.disabled = p.size <= LIMITS.size[0];
      bigger.disabled = p.size >= LIMITS.size[1];
      centreBtn.disabled = p.x === 0;
      resetBtn.disabled = !isChanged(p);
    }
    allBtn.disabled = !Object.values(t[st.face]).some(isChanged);
    if (document.activeElement !== heightIn) heightIn.value = Math.round(t.std_height * 100);
    heightOut.textContent = `${Math.round(t.std_height * 100)}%`;
    heightBack.disabled = t.std_height === 1;
    heightNote.textContent = st.face === 'cover' && card.shape('cover', st.opens, t) !== card.shape('save_the_date', st.opens, t)
      ? 'Guests’ cards open on a folded letter, so this cover keeps its shape; the save the date itself is this tall.'
      : 'The save the date and its cover grow taller together; the width stays the same, and the text keeps its place against the card.';

    status.textContent = dirty ? (v.live ? 'Unsaved changes. Guests see this version as it was last saved.' : 'Unsaved changes.')
      : 'All changes saved.';
    status.classList.toggle('is-unsaved', dirty);
    saveBtn.disabled = st.busy || !dirty;
    undoBtn.disabled = st.busy || !dirty;
    copyBtn.disabled = st.busy;
  }

  /* ----- changing the card's height ----- */
  function setHeight(v) {
    st.draft = { ...st.draft, std_height: Math.min(HEIGHT[1], Math.max(HEIGHT[0], Math.round(v * 100) / 100)) };
    show();
  }

  /* ----- changing a piece ----- */
  function place(patch, key = st.selected, face = st.face) {
    if (!key) return;
    const p = { ...st.draft[face][key], ...patch };
    if (patch.x != null) p.x = round(p.x, 0.5);
    if (patch.y != null) p.y = round(p.y, 0.5);
    if (patch.size != null) p.size = round(p.size, 0.001);
    st.draft = { ...st.draft, [face]: { ...st.draft[face], [key]: p } };
    show();
  }
  /* new words for a piece, in the language shown (or every language, for the couple's names). The card's own
     words aren't kept as a change */
  function reword(key, text, face = st.face, lang = st.lang) {
    const words = card.rewordable(face, key);
    if (!words) return;
    const next = { ...st.draft[face][key].text };
    for (const c of words.same ? card.langs : [lang]) {
      if (text === card.ownWords(face, key, c)) delete next[c]; else next[c] = text;
    }
    place({ text: next }, key, face);
  }
  function pick(key, focus = false) {
    if (key != null && !card.faces[st.face].includes(key)) return;
    if (st.editing && st.editing !== key) stopEditing(true);
    st.selected = key;
    sync();
    remember();
    if (key && focus) { const n = pieceEl(key); if (n) n.focus({ preventScroll: true }); }
    if (!key && sheet.contains(document.activeElement)) document.activeElement.blur();
  }
  function setFace(face) {
    if (face === st.face) return;
    stopEditing(true);
    st.face = face;
    st.selected = null;                                   // a fresh look at the other side
    build();
    remember();
  }
  function setLang(code) {
    if (code === st.lang) return;
    stopEditing(true);
    st.lang = code;
    build();
    remember();
  }

  /* ----- typing on the card ----- */
  function startEditing(key) {
    if (!card.rewordable(st.face, key) || st.editing === key) return;
    stopEditing(true);
    const n = pieceEl(key);
    if (!n) return;
    if (st.selected !== key) { st.selected = key; sync(); }
    st.editing = key;
    st.before = st.draft[st.face][key].text;
    if (n.querySelector('.amp')) n.textContent = card.wordsOf(n);   // typed as plain words; the & turns gold again after
    try { n.contentEditable = 'plaintext-only'; } catch (e) { /* not known to this browser */ }
    if (n.contentEditable !== 'plaintext-only') n.contentEditable = 'true';
    n.classList.add('is-editing');
    n.focus({ preventScroll: true });
    const all = document.createRange();
    all.selectNodeContents(n);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(all);
  }
  /* keep: the words as typed (tidied); otherwise the words from before */
  function stopEditing(keep) {
    const key = st.editing;
    if (!key) return;
    st.editing = null;
    const n = pieceEl(key);
    const typed = n ? card.wordsOf(n) : '';
    if (n) {
      n.removeAttribute('contenteditable');
      n.classList.remove('is-editing');
      n.replaceChildren();                                // drawn afresh from the words, & and all
    }
    if (keep) reword(key, tidyWords(typed, card.textMax));
    else place({ text: st.before }, key);
  }

  /* ----- dragging a piece ----- */
  sheet.addEventListener('pointerdown', (e) => {
    const n = e.target.closest('.adm-piece');
    if (n && n.dataset.piece === st.editing) return;      // putting the cursor in the words being typed
    if (e.button > 0) return;
    if (!n) { pick(null); return; }                       // the card away from the text: nothing picked, no outlines
    e.preventDefault();
    stopEditing(true);
    pick(n.dataset.piece);
    n.focus({ preventScroll: true });
    const p = st.draft[st.face][n.dataset.piece];
    st.drag = { id: e.pointerId, key: n.dataset.piece, sx: e.clientX, sy: e.clientY, x: p.x, y: p.y };
    n.setPointerCapture(e.pointerId);
    sheet.classList.add('is-dragging');
  });
  sheet.addEventListener('pointermove', (e) => {
    const d = st.drag;
    if (!d || d.id !== e.pointerId) return;
    let x = d.x + (e.clientX - d.sx) / unit;
    const y = d.y + (e.clientY - d.sy) / unit;
    const snapped = !e.altKey && Math.abs(x) < SNAP;      // Alt (Option) drags freely past the centre line
    if (snapped) x = 0;
    guide.classList.toggle('is-shown', snapped);
    place({ x: Math.min(LIMITS.x[1], Math.max(LIMITS.x[0], x)), y: Math.min(LIMITS.y[1], Math.max(LIMITS.y[0], y)) }, d.key);
  });
  const endDrag = (e) => {
    if (!st.drag || st.drag.id !== e.pointerId) return;
    st.drag = null;
    guide.classList.remove('is-shown');
    sheet.classList.remove('is-dragging');
  };
  sheet.addEventListener('pointerup', endDrag);
  sheet.addEventListener('pointercancel', endDrag);
  sheet.addEventListener('dblclick', (e) => {
    const n = e.target.closest('.adm-piece');
    if (n) startEditing(n.dataset.piece);
  });
  sheet.addEventListener('input', (e) => {               // typing on the card: the words follow as they're typed
    const n = e.target.closest && e.target.closest('.adm-piece');
    if (n && n.dataset.piece === st.editing) reword(st.editing, card.wordsOf(n).slice(0, card.textMax));
  });
  sheet.addEventListener('paste', (e) => {               // words only, never formatting
    if (!st.editing) return;
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData && e.clipboardData.getData('text/plain')) || '');
  });
  sheet.addEventListener('focusout', (e) => {
    const n = e.target.closest && e.target.closest('.adm-piece');
    if (n && n.dataset.piece === st.editing) stopEditing(true);
  });
  sheet.addEventListener('keydown', (e) => {
    const n = e.target.closest('.adm-piece');
    if (!n) return;
    const key = n.dataset.piece, mod = (e.metaKey || e.ctrlKey) && !e.altKey, letter = e.key.toLowerCase();
    if (mod && ['b', 'i'].includes(letter)) {             // bold, italics: for the whole piece
      e.preventDefault();
      const what = letter === 'b' ? 'bold' : 'italic';
      st.selected = key;
      place({ [what]: !st.draft[st.face][key][what] }, key);
      return;
    }
    if (st.editing === key) {
      if (mod && letter === 'u') e.preventDefault();      // no underlining
      else if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); }
      else if (e.key === 'Enter') { e.preventDefault(); stopEditing(true); n.focus({ preventScroll: true }); }
      else if (e.key === 'Escape') { e.preventDefault(); stopEditing(false); n.focus({ preventScroll: true }); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); pick(null); return; }
    if (e.key === 'Enter' && card.rewordable(st.face, key)) { e.preventDefault(); startEditing(key); return; }
    const step = e.shiftKey ? 2 : 0.5, p = st.draft[st.face][key];
    const move = { ArrowLeft: { x: p.x - step }, ArrowRight: { x: p.x + step }, ArrowUp: { y: p.y - step }, ArrowDown: { y: p.y + step },
                   '+': { size: p.size + 0.05 }, '=': { size: p.size + 0.05 }, '-': { size: p.size - 0.05 } }[e.key];
    if (!move) return;
    e.preventDefault();
    for (const [k, v] of Object.entries(move)) move[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], v));
    st.selected = key;
    place(move, key);
  });
  sheet.addEventListener('focusin', (e) => {
    const n = e.target.closest('.adm-piece');
    if (n && n.dataset.piece !== st.selected) pick(n.dataset.piece);
  });

  /* ----- the words and the sample names ----- */
  let wordsFor = null;                                    // the piece the words box is for, while it's being typed in
  wordsIn.addEventListener('focus', () => { wordsFor = st.selected && { key: st.selected, face: st.face, lang: st.lang }; });
  wordsIn.addEventListener('input', () => {
    if (wordsFor) reword(wordsFor.key, wordsIn.value, wordsFor.face, wordsFor.lang);
  });
  wordsIn.addEventListener('change', () => {
    if (!wordsFor) return;
    const text = tidyWords(wordsIn.value, card.textMax);
    reword(wordsFor.key, text, wordsFor.face, wordsFor.lang);
    if (document.activeElement === wordsIn) wordsIn.value = text;
  });
  wordsIn.addEventListener('blur', () => { wordsFor = null; sync(); });
  sampleIn.addEventListener('input', () => {
    st.sample = sampleIn.value;
    if (st.face !== 'cover') return;
    card.greet(sheet, sampleNames(), st.lang);
    paint();
    sync();
    remember();
  });

  /* ----- the versions: saving, switching, making live ----- */
  /* one request at a time; the buttons wait for it */
  async function request(send) {
    if (st.busy) return undefined;
    st.busy = true;
    sync();
    try { return await send(); } catch (err) { fail(err); return undefined; } finally { st.busy = false; sync(); }
  }
  const leave = () => !isDirty() || window.confirm(`Discard your unsaved changes to “${version().name}”?`);
  const askName = (message, suggestion) => clean(window.prompt(message, suggestion) || '').slice(0, VERSION_NAME_MAX);
  function switchTo(id) {
    if (id === st.id || !leave()) return false;
    open(id);
    return true;
  }
  async function makeLive(id) {
    const v = st.versions.find((x) => x.id === id);
    if (!v || v.live) return false;
    const withChanges = id === st.id && isDirty();
    if (!window.confirm(withChanges ? `Save your changes to “${v.name}” and show it to every guest from their next visit?`
      : `Every guest will see “${v.name}” from their next visit. Make it live?`)) return false;
    const list = await request(() => api('PATCH', `/admin/versions/${id}`, withChanges ? { layout: st.draft, live: true } : { live: true }));
    if (!list) return false;
    st.versions = list;
    if (id === st.id) open(id); else sync();
    say(`Guests now see “${v.name}”.`);
    return true;
  }
  async function save() {
    const v = version();
    if (v.live && !window.confirm(`Guests see “${v.name}”. Save, so they see these changes from their next visit?`)) return;
    const list = await request(() => api('PATCH', `/admin/versions/${v.id}`, { layout: st.draft }));
    if (!list) return;
    st.versions = list;
    open(v.id);
    say(v.live ? `Saved. Guests now see the changes to “${v.name}”.` : `Saved “${v.name}”.`);
  }
  async function saveAsNew() {
    const v = version();
    const name = askName('Name the new version. It starts as this one is now, with any unsaved changes.', `${v.name} (copy)`);
    if (!name) return;
    const made = await request(() => api('POST', '/admin/versions', { name, layout: st.draft }));
    if (!made) return;
    st.versions = [...st.versions, made];
    open(made.id);
    const live = liveVersion();
    say(`Saved as “${made.name}”.${live ? ` Guests still see “${live.name}”.` : ''}`);
  }
  async function newVersion() {
    if (!leave()) return;
    const name = askName('Name the new version. It starts from the card’s original layout.', `Version ${st.versions.length + 1}`);
    if (!name) return;
    const made = await request(() => api('POST', '/admin/versions', { name }));
    if (!made) return;
    st.versions = [...st.versions, made];
    open(made.id);
    say(`Made “${made.name}”. Guests won’t see it until it’s made live.`);
  }
  async function rename() {
    const v = version();
    const name = askName('A new name for this version:', v.name);
    if (!name || name === v.name) return;
    const list = await request(() => api('PATCH', `/admin/versions/${v.id}`, { name }));
    if (!list) return;
    st.versions = list;
    sync();
    remember();
  }
  async function remove() {
    const v = version();
    if (v.live || !window.confirm(`Delete “${v.name}”? This can’t be undone.`)) return;
    const done = await request(() => api('DELETE', `/admin/versions/${v.id}`).then(() => true));
    if (!done) return;
    st.versions = st.versions.filter((x) => x.id !== v.id);
    st.id = null;
    open((liveVersion() || st.versions[0]).id);
    say(`Deleted “${v.name}”.`);
  }

  /* ----- what each control does ----- */
  el.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-pick]');
    if (chip) { pick(chip.dataset.pick, true); return; }
    const side = e.target.closest('[data-side]');
    if (side) { setFace(side.dataset.side); return; }
    const lang = e.target.closest('[data-show-lang]');
    if (lang) { setLang(lang.dataset.showLang); return; }
    const ver = e.target.closest('[data-version]');
    if (ver) { if (!st.busy) switchTo(Number(ver.dataset.version)); return; }
    const act = e.target.closest('[data-layout-act]');
    if (!act || act.disabled) return;
    const p = st.selected && st.draft[st.face][st.selected];
    switch (act.dataset.layoutAct) {
      case 'deselect': pick(null); break;
      case 'centre': place({ x: 0 }); break;
      case 'smaller': case 'bigger': {                    // a pixel at a time, as on a computer screen
        const base = basePx(st.selected);
        if (!p || !base) break;
        const px = Math.round(base * p.size) + (act.dataset.layoutAct === 'bigger' ? 1 : -1);
        place({ size: Math.min(LIMITS.size[1], Math.max(LIMITS.size[0], px / base)) });
        break;
      }
      case 'reset':
        place({ x: 0, y: 0, size: 1, bold: false, italic: false, ...(card.rewordable(st.face, st.selected) ? { text: {} } : {}) });
        break;
      case 'bold': case 'italic': {
        const what = act.dataset.layoutAct;
        if (p) place({ [what]: !p[what] });
        break;
      }
      case 'own-words': {
        const words = card.rewordable(st.face, st.selected);
        if (!p || !words) break;
        const next = { ...p.text };
        if (words.same) for (const c of card.langs) delete next[c]; else delete next[st.lang];
        place({ text: next });
        break;
      }
      case 'height-back': setHeight(1); break;
      case 'all': stopEditing(true); st.draft = { ...st.draft, [st.face]: card.original()[st.face] }; show(); break;
      case 'discard': open(st.id); break;
      case 'see': close(); break;
      case 'save': save(); break;
      case 'save-new': saveAsNew(); break;
      case 'new': newVersion(); break;
      case 'live': makeLive(st.id); break;
      case 'rename': rename(); break;
      case 'delete': remove(); break;
      case 'compare': openCompare(); break;
    }
  });
  el.addEventListener('input', (e) => {
    if (e.target === heightIn) { setHeight(+heightIn.value / 100); return; }
    const key = e.target.dataset && e.target.dataset.place;
    if (key) place({ [key]: key === 'size' ? +e.target.value / 100 : +e.target.value });
  });

  /* ----- every version side by side, each card at its real size ----- */
  let compare = null;
  function openCompare() {
    stopEditing(true);
    if (compare) return;
    const cmp = { face: 'both', lang: st.lang, fit: false };
    const showSides = [{ value: 'both', label: 'Both sides' }, ...SIDES];
    const sideSeg = h('div', { class: 'adm-views', role: 'group', 'aria-label': 'Show' },
      showSides.map((s) => h('button', { type: 'button', class: 'adm-view', 'data-cmp-side': s.value }, s.label)));
    const langSeg = h('div', { class: 'adm-rsvp', role: 'group', 'aria-label': 'Language' },
      card.langs.map((c) => h('button', { type: 'button', class: 'adm-seg is-pick', 'data-cmp-lang': c, lang: c }, LANG_NAMES[c] || c)));
    const fitBtn = h('button', { type: 'button', class: 'adm-text-btn', 'data-cmp-act': 'fit', 'aria-pressed': 'false' }, 'Fit to screen');
    const closeCmp = h('button', { type: 'button', class: 'adm-close', 'data-cmp-act': 'close', 'aria-label': 'Close' }, '×');
    const note = h('p', { class: 'adm-cmp-note' });
    const row = h('div', { class: 'adm-cmp-row' });
    const overlay = h('div', { class: 'adm adm-cmp is-open', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Compare versions', tabindex: -1 },
      h('header', { class: 'adm-cmp-head' },
        h('div', { class: 'adm-title' }, h('span', { class: 'adm-xi', 'aria-hidden': 'true' }, '囍'), h('h1', null, 'Compare versions')),
        h('div', { class: 'adm-cmp-tools' }, sideSeg, langSeg, fitBtn),
        closeCmp),
      note,
      row);
    const GAP = 40;
    function render() {
      for (const b of sideSeg.children) b.setAttribute('aria-pressed', String(b.dataset.cmpSide === cmp.face));
      for (const b of langSeg.children) b.setAttribute('aria-pressed', String(b.dataset.cmpLang === cmp.lang));
      fitBtn.setAttribute('aria-pressed', String(cmp.fit));
      fitBtn.textContent = cmp.fit ? 'Actual size' : 'Fit to screen';
      const faces = cmp.face === 'both' ? SIDES.map((s) => s.value) : [cmp.face];
      const n = st.versions.length;
      const pad = parseFloat(getComputedStyle(row).paddingLeft) * 2 || 0;
      const room = (overlay.clientWidth - pad - (n - 1) * GAP) / n;
      const w = Math.round(cmp.fit ? Math.max(150, Math.min(card.widest, room)) : card.widest);
      const wider = n * (w + GAP) - GAP + pad > overlay.clientWidth;
      note.textContent = (cmp.fit ? `Shrunk to ${Math.round((w / card.widest) * 100)}% of their real size.`
        : 'Each card at its real size, as on a computer screen.') + (wider ? ' Scroll sideways to see them all.' : '');
      const live = liveVersion();
      row.replaceChildren(...st.versions.map((v) => {
        const editing = v.id === st.id, unsaved = editing && isDirty();
        const layout = editing ? st.draft : card.normal(v.layout);
        return h('section', { class: `adm-cmp-col${v.live ? ' is-live' : ''}`, 'data-cmp-version': v.id, style: `width:${w}px` },
          h('div', { class: 'adm-cmp-top' },
            h('h2', { class: 'adm-cmp-name' }, v.name),
            v.live && h('span', { class: 'adm-live', title: 'Guests see this version' }, 'Live'),
            unsaved && h('span', { class: 'adm-cmp-unsaved' }, 'with your unsaved changes'),
            h('span', { class: 'adm-cmp-acts' },
              editing ? h('span', { class: 'adm-cmp-unsaved' }, 'Being edited')
                : h('button', { type: 'button', class: 'adm-text-btn', 'data-cmp-act': 'edit', disabled: st.busy }, 'Edit'),
              !v.live && h('button', { type: 'button', class: 'adm-btn adm-btn-quiet', 'data-cmp-act': 'live', disabled: st.busy,
                                       title: live ? `Instead of “${live.name}”` : null }, 'Make live'))),
          faces.map((f) => h('figure', { class: 'adm-cmp-face' },
            faceSheet(card, f, layout, cmp.lang, w, st.opens, sampleNames()),
            h('figcaption', null, sideName(f)))));
      }));
    }
    overlay.addEventListener('click', async (e) => {
      const side = e.target.closest('[data-cmp-side]');
      if (side) { cmp.face = side.dataset.cmpSide; render(); return; }
      const lang = e.target.closest('[data-cmp-lang]');
      if (lang) { cmp.lang = lang.dataset.cmpLang; render(); return; }
      const act = e.target.closest('[data-cmp-act]');
      if (!act || act.disabled) return;
      const col = act.closest('[data-cmp-version]'), id = col && Number(col.dataset.cmpVersion);
      switch (act.dataset.cmpAct) {
        case 'close': shut(); break;
        case 'fit': cmp.fit = !cmp.fit; render(); break;
        case 'edit': if (switchTo(id)) shut(); break;
        case 'live': if (await makeLive(id)) render(); break;
      }
    });
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();                                // the panel beneath stays open
      shut();
    };
    const refit = new ResizeObserver(() => { if (cmp.fit) render(); });
    function shut() {
      document.removeEventListener('keydown', onKey, true);
      refit.disconnect();
      overlay.remove();
      compare = null;
      if (compareBtn.isConnected) compareBtn.focus({ preventScroll: true });
    }
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    refit.observe(overlay);
    render();
    overlay.focus({ preventScroll: true });
    compare = { shut };
  }

  return {
    el,
    /* the versions, fresh each time the view is shown; a version with unsaved changes keeps them */
    async load() {
      stopEditing(true);
      let versions, letters;
      try {
        [versions, letters] = await Promise.all([api('GET', '/admin/versions'), api('GET', '/admin/letters').catch(() => null)]);
      } catch (err) { fail(err); return; }
      const opener = letters && letters.find((l) => l.opens_first);
      st.opens = opener ? opener.kind : null;
      const first = st.id == null;                        // just made: back to what was being edited before, if anything
      const wanted = first ? mem.id : st.id;
      const kept = first ? mem.draft : isDirty() ? st.draft : null;
      st.versions = versions;
      const target = versions.find((v) => v.id === wanted) || versions.find((v) => v.live) || versions[0];
      if (!target) return;
      st.id = target.id;
      st.draft = card.normal(target.id === wanted && kept ? kept : target.layout);
      build();
      show();
      if (!st.cjk) loadPageCjk().then((set) => { st.cjk = set; sync(); });
    },
    dispose() {
      if (compare) compare.shut();
      resize.disconnect();
    }
  };
}
