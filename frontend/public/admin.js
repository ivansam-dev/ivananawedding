/* Guest list & RSVP manager for the save the date.
   Fetched only when 囍 is tapped five times on the language screen, so guests never download it.
   Root admins see and change everything; link admins see each group with its Copy link button. */

const RSVP = [
  { value: 'attending', label: 'Attending' },
  { value: 'not_attending', label: 'Not attending' },
  { value: 'no_response', label: 'No response' }
];
const KINDS = [
  { value: 'save_the_date', label: 'Save the date' },
  { value: 'invitation', label: 'Invitation' }
];
const VIEWS = [
  { value: 'guests', label: 'Guests' },
  { value: 'groups', label: 'Groups' }
];
const FILTERS = {
  guests: [
    { value: 'all', label: 'All guests' },
    { value: 'attending', label: 'Attending' },
    { value: 'not_attending', label: 'Not attending' },
    { value: 'no_response', label: 'No response yet' },
    { value: 'std_unsent', label: 'Save the date not sent' },
    { value: 'inv_unsent', label: 'Invitation not sent' }
  ],
  groups: [
    { value: 'all', label: 'All groups' },
    { value: 'std_unsent', label: 'Save the date not sent' },
    { value: 'inv_unsent', label: 'Invitation not sent' },
    { value: 'awaiting', label: 'Waiting on an RSVP' }
  ]
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
                  editing: null };  // id of the guest being renamed in the guests view
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
      '. Guests in the same group share one link; rank sets who is named first. Guests already listed are skipped.'),
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
      h('div', { class: 'adm-tools' }, views, search, filter),
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
    renderStats();
    renderList();
  }
  /* changes run one after another, so each response is applied in the order it was asked for */
  let queue = Promise.resolve();
  function mutate(request, { reload = false } = {}) {
    const job = queue.then(async () => {
      try {
        const out = await request();
        if (reload || !out) await refresh();
        else upsert(out);
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
    renderStats();
    if (state.view === 'guests') renderList(); else renderGroup(group.id);
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
      case 'awaiting': return g.guests.some((x) => x.rsvp === 'no_response');
      default: return true;
    }
  }

  function guestMatches(x, g, q) {
    if (q &&!fold(x.name).includes(q) && !fold(g.name).includes(q)) return false;
    switch (state.filter) {
      case 'attending':
      case 'not_attending':
      case 'no_response': return x.rsvp === state.filter;
      case 'std_unsent': return !x.save_the_date_sent_at;
      case 'inv_unsent': return !x.invitation_sent_at;
      default: return true;
    }
  }

  function renderStats() {
    if (!isRoot) return;
    const guests = state.groups.flatMap((g) => g.guests);
    const withGuests = state.groups.filter((g) => g.guests.length);
    const rsvp = (v) => guests.filter((x) => x.rsvp === v).length;
    const sentGroups = (k) => withGuests.filter((g) => sentState(g, k) === 'all').length;
    const stat = (value, label, cls = '') =>
      h('div', { class: `adm-stat ${cls}` }, h('strong', null, String(value)), h('span', null, label));
    stats.replaceChildren(
      stat(guests.length, guests.length === 1 ? 'guest' : 'guests'),
      stat(state.groups.length, state.groups.length === 1 ? 'group' : 'groups'),
      stat(rsvp('attending'), 'attending', 'is-attending'),
      stat(rsvp('not_attending'), 'not attending', 'is-not_attending'),
      stat(rsvp('no_response'), 'no response yet', 'is-no_response'),
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
    const b = panel.querySelector(`[data-key="${key}"]`);
    if (!b || b.disabled) return;
    b.focus({ preventScroll: true });
    if (typed) {
      b.value = typed.value;
      try { b.setSelectionRange(typed.start, typed.end); } catch (e) { /* not a text field */ }
    }
  }
  function renderList() {
    keepFocus(list, () => {
      let shown;
      const q = fold(state.query.trim());
      if (state.view === 'guests') {
        shown = state.groups
          .flatMap((g) => g.guests.filter((x) => guestMatches(x, g, q)).map((x) => [fold(x.name), x, g]))
          .sort(([a], [b]) => a.localeCompare(b))           // folded once each, not on every comparison
          .map(([, x, g]) => guestRowEl(g, x));
      } else {
        shown = state.groups.filter((g) => matches(g, q)).map(groupEl);
      }
      const hasGuests = state.groups.some((g) => g.guests.length);
      const empty = !state.groups.length || (state.view === 'guests' && !hasGuests)
        ? (isRoot ? 'No guests yet. Add a group above, or import a CSV.' : 'No groups yet.')
        : 'Nothing matches.';
      list.classList.toggle('is-guests', state.view === 'guests');
      list.replaceChildren(...(shown.length ? shown : [h('p', { class: 'adm-empty' }, empty)]));
    });
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

  function rsvpSummary(g) {
    return h('span', { class: 'adm-group-rsvp' },
      RSVP.map((r) => [r, g.guests.filter((x) => x.rsvp === r.value).length])
        .filter(([, n]) => n)
        .map(([r, n]) => h('span', { class: `adm-dot is-${r.value}` }, `${n} ${r.label.toLowerCase()}`)));
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
      h('div', { class: 'adm-rsvp', role: 'group', 'aria-label': `RSVP for ${x.name}` },
        RSVP.map((r) => h('button', { type: 'button', class: `adm-seg is-${r.value}`, 'data-act': 'rsvp', 'data-value': r.value,
                                      'aria-pressed': String(x.rsvp === r.value), 'data-key': `rsvp-${x.id}-${r.value}` }, r.label))),
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
                    'aria-label': `Remove ${x.name}`, title: 'Remove from the guest list' }, '×'));
  }

  /* one row per guest: their name, with edit / copy link / open group on hover, and their RSVP */
  function guestRowEl(g, x) {
    const name = state.editing === x.id
      ? h('input', { type: 'text', class: 'adm-input adm-row-name', value: x.name, maxlength: 60, autocomplete: 'off',
                     'aria-label': `New name for ${x.name}`, 'data-edit': 'name', 'data-key': `name-${x.id}` })
      : h('div', { class: 'adm-row-who' },
          h('span', { class: 'adm-row-name' }, x.name),
          h('div', { class: 'adm-row-acts' },                // shown on hover
            h('button', { type: 'button', class: 'adm-icon adm-edit', 'data-act': 'edit-name', 'data-key': `edit-${x.id}`,
                          'aria-label': `Edit ${x.name}'s name`, title: 'Edit name' }, icon('edit')),
            h('button', { type: 'button', class: 'adm-icon', 'data-act': 'copy', 'data-key': `copy-guest-${x.id}`,
                          'aria-label': `Copy the link for ${g.name}`, title: `Copy link (${g.name})` }, icon('link')),
            h('button', { type: 'button', class: 'adm-icon', 'data-act': 'open-group', 'data-key': `open-${x.id}`,
                          'aria-label': `Open group: ${g.name}`, title: `Open group (${g.name})` }, icon('open'))));
    return h('div', { class: 'adm-row', 'data-group': g.id, 'data-guest': x.id },
      name,
      h('div', { class: 'adm-rsvp', role: 'group', 'aria-label': `RSVP for ${x.name}` },
        RSVP.map((r) => h('button', { type: 'button', class: `adm-seg is-${r.value}`, 'data-act': 'rsvp', 'data-value': r.value,
                                      'aria-pressed': String(x.rsvp === r.value), 'data-key': `rsvp-${x.id}-${r.value}` }, r.label))));
  }

  function setView(view, { openGroup = null } = {}) {
    state.view = view;
    if (!FILTERS[view].some((f) => f.value === state.filter)) state.filter = 'all';
    for (const b of views.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === view));
    if (openGroup != null) {                              // jumping to a guest's group: make sure it's shown and open
      state.query = search.value = '';
      state.filter = 'all';
      state.expanded.add(openGroup);
    }
    fillFilter();
    renderList();
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
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
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
      case 'edit-name': {
        if (!x) break;
        state.editing = x.id;
        const row = el.closest('.adm-row');
        row.replaceWith(guestRowEl(g, x));
        const input = list.querySelector(`[data-key="name-${x.id}"]`);
        if (input) { input.focus(); input.select(); }
        break;
      }
      case 'group-sent':                                   // all sent: undo for everyone; otherwise send to everyone
        mutate(() => api('POST', `/admin/groups/${g.id}/sent`, { kind, sent: sentState(byId(g.id) || g, kind) !== 'all' }));
        break;
      case 'rsvp':
        if (x && x.rsvp !== el.dataset.value) mutate(() => api('PATCH', `/admin/guests/${x.id}`, { rsvp: el.dataset.value }));
        break;
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
    const { g, x } = context(el);
    if (!g) return;
    if (act === 'rename-guest' && x) {
      const name = clean(el.value);
      if (!name) { el.value = x.name; return; }
      if (name !== x.name) mutate(() => api('PATCH', `/admin/guests/${x.id}`, { name }));
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
    if (el.dataset.edit !== 'name') return;
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); el.dataset.cancel = '1'; el.blur(); }
  });
  list.addEventListener('focusout', (e) => {
    const el = e.target;
    if (el.dataset.edit !== 'name' || !el.isConnected || !list.contains(el)) return;  // a re-render took it, not the user
    const { g, x } = context(el);
    state.editing = null;
    if (!g || !x) { renderList(); return; }
    const name = clean(el.value);
    const row = el.closest('.adm-row');
    const back = guestRowEl(g, x);                         // only this row, so a click elsewhere still lands
    row.replaceWith(back);
    if (el.dataset.cancel) back.querySelector('.adm-edit').focus();
    else if (name && name !== x.name) mutate(() => api('PATCH', `/admin/guests/${x.id}`, { name }));
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
