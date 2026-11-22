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
  { value: 'letters', label: 'Letters' }
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
  letters: [{ value: 'all', label: 'All letters' }]     // nor do the letters
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
  const base = (me.base_url || location.origin).replace(/\/+$/, '');
  const linkFor = (g) => `${base}/${g.public_id}`;
  /* root admins start on one row per guest; link admins only ever see groups */
  const state = { groups: [], expanded: new Set(), query: '', filter: 'all', view: isRoot ? 'guests' : 'groups',
                  category: 'all', location: 'all', sort: 'name',
                  letters: null,    // [{ kind, active, rank, opens_first }], earliest first; loaded with the Letters view

                  editing: null };  // in the guests view, what's being edited: "name-<id>", "category-<id>" or "location-<id>"
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
    filter.hidden = state.view === 'categories' || state.view === 'letters';
    search.hidden = state.view === 'letters';
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

  async function copyLink(g, btn) {
    const url = linkFor(g);
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
    if (!ok) { window.prompt('Copy this link:', url); return; }
    const label = [...btn.childNodes];                     // text, or an icon in the guests view
    btn.replaceChildren(btn.classList.contains('adm-icon') ? icon('check') : 'Copied');
    btn.classList.add('is-done');
    setTimeout(() => { btn.replaceChildren(...label); btn.classList.remove('is-done'); }, 1600);
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
