/* SoCal Stream — listings-first event browser
   Default view: rich event-card grid, all filtered events visible immediately.
   Tabs: Grid (default) · Visual (poster wall) · Calendar · Map
*/
(function () {
  'use strict';

  const state = {
    events: [],
    filtered: [],
    view: 'grid',
    calendarDate: new Date(),
    map: null,
    markers: [],
  };

  const els = {
    header: document.getElementById('site-header'),
    grid: document.getElementById('event-grid'),
    empty: document.getElementById('empty-state'),
    visualGrid: document.getElementById('visual-grid'),
    calGrid: document.getElementById('calendar-grid'),
    calTitle: document.getElementById('cal-title'),
    calPrev: document.getElementById('cal-prev'),
    calNext: document.getElementById('cal-next'),
    resultsCount: document.getElementById('results-count'),
    viewTabs: document.querySelectorAll('.view-tab'),
    navLinks: document.querySelectorAll('.nav-link'),
    search: document.getElementById('filter-search'),
    city: document.getElementById('filter-city'),
    category: document.getElementById('filter-category'),
    from: document.getElementById('filter-from'),
    to: document.getElementById('filter-to'),
    clear: document.getElementById('clear-filters'),
    searchToggle: document.getElementById('search-toggle'),
    searchPanel: document.getElementById('search-panel'),
    searchInput: document.getElementById('search'),
    searchResults: document.getElementById('search-results'),
  };

  // ---------- Constants ----------
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // Category gradients (start → end) and icons for fallback cards
  const CAT_STYLE = {
    'Festival':   { g: ['#ff7a59','#f5c451'], icon: '🎪' },
    'Concert':    { g: ['#7c3aed','#2dd4bf'], icon: '🎵' },
    'Sports':     { g: ['#065f46','#2dd4bf'], icon: '🏟️' },
    'Fair':       { g: ['#d97706','#ff7a59'], icon: '🎡' },
    'Arts':       { g: ['#be185d','#7c3aed'], icon: '🎨' },
    'Market':     { g: ['#0f766e','#2dd4bf'], icon: '🛍️' },
    'Convention': { g: ['#1d4ed8','#1c3252'], icon: '🎤' },
  };
  function catStyle(category) {
    return CAT_STYLE[category] || { g: ['#1c3252','#0a1628'], icon: '📅' };
  }

  // ---------- Helpers ----------
  function parseDate(s) {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function toISODate(d) {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function formatDateRange(startStr, endStr, short) {
    const s = parseDate(startStr);
    const e = parseDate(endStr);
    const M = short ? MONTHS_SHORT : MONTHS;
    const sM = M[s.getMonth()], eM = M[e.getMonth()];
    if (sameDay(s, e)) return `${sM} ${s.getDate()}, ${s.getFullYear()}`;
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth())
      return `${sM} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
    if (s.getFullYear() === e.getFullYear())
      return `${sM} ${s.getDate()} – ${eM} ${e.getDate()}, ${s.getFullYear()}`;
    return `${sM} ${s.getDate()}, ${s.getFullYear()} – ${eM} ${e.getDate()}, ${e.getFullYear()}`;
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
  // Google Maps directions URL — works on iOS/Android/desktop; native apps
  // on mobile will intercept and open the system maps app.
  function directionsUrl(ev) {
    const parts = [ev.address, ev.city, ev.state, ev.zip].filter(Boolean).join(', ');
    const dest = parts || ev.venue || '';
    const q = ev.coords
      ? `${ev.coords.lat},${ev.coords.lng}`
      : dest;
    const placeName = ev.venue ? encodeURIComponent(ev.venue) : '';
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}${placeName ? `&destination_place_id_name=${placeName}` : ''}`;
  }

  // ---------- Data load ----------
  async function loadEvents() {
    try {
      const res = await fetch('data/events.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.events = data.sort((a, b) => a.startDate.localeCompare(b.startDate));
      populateFilterOptions();
      applyFilters();
    } catch (err) {
      console.error(err);
      els.grid.innerHTML = '<p class="empty-state">Unable to load events. Please try again later.</p>';
    }
  }

  function populateFilterOptions() {
    const cities = [...new Set(state.events.map(e => e.city))].sort();
    const categories = [...new Set(state.events.map(e => e.category))].sort();
    cities.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      els.city.appendChild(opt);
    });
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      els.category.appendChild(opt);
    });
  }

  // ---------- Filtering ----------
  function applyFilters() {
    const q = els.search.value.trim().toLowerCase();
    const city = els.city.value;
    const cat = els.category.value;
    const from = els.from.value;
    const to = els.to.value;

    state.filtered = state.events.filter(e => {
      if (city && e.city !== city) return false;
      if (cat && e.category !== cat) return false;
      if (from && e.endDate < from) return false;
      if (to && e.startDate > to) return false;
      if (q) {
        const hay = `${e.title} ${e.venue} ${e.city} ${e.category} ${e.shortDescription || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    updateResultsCount();
    renderCurrentView();
  }

  function updateResultsCount() {
    const n = state.filtered.length;
    els.resultsCount.textContent = `${n} ${n === 1 ? 'event' : 'events'} found`;
  }

  // ---------- Grid view (default, listings-first) ----------
  function renderGrid() {
    els.grid.innerHTML = '';
    if (!state.filtered.length) {
      els.empty.hidden = false;
      return;
    }
    els.empty.hidden = true;
    const frag = document.createDocumentFragment();
    state.filtered.forEach(ev => frag.appendChild(buildCard(ev)));
    els.grid.appendChild(frag);
  }

  function buildCard(ev) {
    const card = document.createElement('article');
    card.className = 'event-card';
    const img = ev.flyer || ev.poster || '';
    const start = parseDate(ev.startDate);
    const day = start.getDate();
    const monShort = MONTHS_SHORT[start.getMonth()];
    const priceHtml = ev.price
      ? `<span class="card-price">From <strong>$${ev.price.from}</strong></span>`
      : `<span class="card-price free-label">FREE</span>`;
    const dirHref = escapeHtml(directionsUrl(ev));
    const { g, icon } = catStyle(ev.category);
    const dateLabel = escapeHtml(formatDateRange(ev.startDate, ev.endDate, true));

    // Fallback card: always rendered; hidden when a real image is present.
    // Revealed by the img onerror handler if the remote image fails to load.
    const fallback = `
      <div class="card-fallback" style="background:linear-gradient(160deg,${g[0]} 0%,${g[1]} 100%)${img ? ';display:none' : ''}">
        <div class="fallback-icon">${icon}</div>
        <div class="fallback-title">${escapeHtml(ev.title)}</div>
        <div class="fallback-date">${dateLabel}</div>
        <span class="fallback-brand">SoCal Stream</span>
      </div>`;

    const imgTag = img
      ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(ev.title)}" loading="lazy"
             onerror="this.style.display='none';this.previousElementSibling.style.display='flex'" />`
      : '';

    card.innerHTML = `
      <a class="card-link" href="event.html?id=${encodeURIComponent(ev.id)}">
        <div class="card-image">
          ${fallback}
          ${imgTag}
          <span class="badge">${escapeHtml(ev.category)}</span>
          <div class="date-stamp">
            <span class="day">${day}</span>
            <span>${escapeHtml(monShort).toUpperCase()}</span>
          </div>
          <div class="card-overlay">
            <h3 class="card-title">${escapeHtml(ev.title)}</h3>
            <span class="card-when">${dateLabel}</span>
            <div class="card-where">📍 ${escapeHtml(ev.venue)} · ${escapeHtml(ev.city)}</div>
            <div class="card-meta-row">
              ${priceHtml}
              <span class="card-cta">View →</span>
            </div>
          </div>
        </div>
      </a>
      <div class="card-actions">
        <a class="card-action card-action-directions"
           href="${dirHref}"
           target="_blank"
           rel="noopener"
           aria-label="Get directions to ${escapeHtml(ev.venue)}"
           title="Open directions in Google Maps">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          Directions
        </a>
        ${ev.ticketUrl
          ? `<a class="card-action card-action-tickets"
                href="${escapeHtml(ev.ticketUrl)}"
                target="_blank"
                rel="noopener"
                aria-label="Buy tickets for ${escapeHtml(ev.title)}"
                title="Buy tickets">🎟 Tickets</a>`
          : ''}
      </div>
    `;
    return card;
  }

  // ---------- Visual grid (poster wall) ----------
  function renderVisualGrid() {
    els.visualGrid.innerHTML = '';
    if (!state.filtered.length) {
      els.visualGrid.innerHTML = '<p class="empty-state">No events match your filters.</p>';
      return;
    }
    state.filtered.forEach(ev => els.visualGrid.appendChild(buildPoster(ev)));
  }

  function buildPoster(ev) {
    const wrap = document.createElement('div');
    wrap.className = 'poster-wrap';
    const a = document.createElement('a');
    a.className = 'poster';
    a.href = `event.html?id=${encodeURIComponent(ev.id)}`;
    const img = ev.poster || ev.flyer || '';
    const { g, icon } = catStyle(ev.category);
    a.innerHTML = `
      <div class="card-fallback" style="background:linear-gradient(160deg,${g[0]} 0%,${g[1]} 100%)${img ? ';display:none' : ''}">
        <div class="fallback-icon">${icon}</div>
        <div class="fallback-title">${escapeHtml(ev.title)}</div>
        <span class="fallback-brand">SoCal Stream</span>
      </div>
      ${img
        ? `<img class="poster-img" src="${escapeHtml(img)}" alt="${escapeHtml(ev.title)} poster" loading="lazy"
               onerror="this.style.display='none';this.previousElementSibling.style.display='flex'" />`
        : ''}
      <div class="poster-overlay">
        <span class="poster-cat">${escapeHtml(ev.category)}</span>
        <div class="poster-title">${escapeHtml(ev.title)}</div>
        <div class="poster-meta">
          <span class="poster-date">${escapeHtml(formatDateRange(ev.startDate, ev.endDate, true))}</span>
          <span>${escapeHtml(ev.venue)} · ${escapeHtml(ev.city)}</span>
        </div>
      </div>
    `;
    wrap.appendChild(a);

    // Floating directions button — sits over the poster, separate sibling
    // (avoids invalid nested-anchor markup). Becomes visible on hover.
    const dirBtn = document.createElement('a');
    dirBtn.className = 'poster-dir-btn';
    dirBtn.href = directionsUrl(ev);
    dirBtn.target = '_blank';
    dirBtn.rel = 'noopener';
    dirBtn.title = `Directions to ${ev.venue}`;
    dirBtn.setAttribute('aria-label', `Get directions to ${ev.venue}`);
    dirBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`;
    wrap.appendChild(dirBtn);

    return wrap;
  }

  // ---------- Calendar ----------
  function renderCalendar() {
    const d = state.calendarDate;
    const year = d.getFullYear();
    const month = d.getMonth();
    els.calTitle.textContent = `${MONTHS[month]} ${year}`;
    els.calGrid.innerHTML = '';
    WEEKDAYS.forEach(w => {
      const wd = document.createElement('div');
      wd.className = 'cal-weekday';
      wd.textContent = w;
      els.calGrid.appendChild(wd);
    });
    const startWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysPrev = new Date(year, month, 0).getDate();
    const today = new Date();

    for (let i = startWeekday - 1; i >= 0; i--) {
      els.calGrid.appendChild(buildCalDay(new Date(year, month - 1, daysPrev - i), true));
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const cellDate = new Date(year, month, i);
      const cell = buildCalDay(cellDate, false);
      if (sameDay(cellDate, today)) cell.classList.add('today');
      els.calGrid.appendChild(cell);
    }
    const total = startWeekday + daysInMonth;
    const trail = (7 - (total % 7)) % 7;
    for (let i = 1; i <= trail; i++) {
      els.calGrid.appendChild(buildCalDay(new Date(year, month + 1, i), true));
    }
  }

  function buildCalDay(date, outside) {
    const cell = document.createElement('div');
    cell.className = 'cal-day' + (outside ? ' outside' : '');
    const num = document.createElement('span');
    num.className = 'cal-date-num';
    num.textContent = date.getDate();
    cell.appendChild(num);

    const dateStr = toISODate(date);
    const evts = state.filtered.filter(e => dateStr >= e.startDate && dateStr <= e.endDate);
    evts.slice(0, 3).forEach(ev => {
      const a = document.createElement('a');
      a.className = 'cal-event';
      a.href = `event.html?id=${encodeURIComponent(ev.id)}`;
      a.title = `${ev.title} — ${ev.venue}`;
      a.textContent = ev.title;
      cell.appendChild(a);
    });
    if (evts.length > 3) {
      const more = document.createElement('span');
      more.className = 'cal-event';
      more.style.background = 'transparent';
      more.style.borderLeft = 'none';
      more.style.color = 'var(--text-muted)';
      more.textContent = `+${evts.length - 3} more`;
      cell.appendChild(more);
    }
    return cell;
  }

  // ---------- Map ----------
  function renderMap() {
    if (!state.map) {
      state.map = L.map('map').setView([33.9, -117.8], 8);
      L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(state.map);
    }
    state.markers.forEach(m => state.map.removeLayer(m));
    state.markers = [];
    const bounds = [];
    state.filtered.forEach(ev => {
      if (!ev.coords) return;
      const marker = L.marker([ev.coords.lat, ev.coords.lng]).addTo(state.map);
      marker.bindPopup(`
        <div class="popup-title">${escapeHtml(ev.title)}</div>
        <div class="popup-meta">${escapeHtml(formatDateRange(ev.startDate, ev.endDate, true))}</div>
        <div class="popup-meta">${escapeHtml(ev.venue)} · ${escapeHtml(ev.city)}</div>
        <div class="popup-actions">
          <a class="popup-link" href="event.html?id=${encodeURIComponent(ev.id)}">View details →</a>
          <a class="popup-link popup-link-dir" href="${escapeHtml(directionsUrl(ev))}" target="_blank" rel="noopener">🧭 Directions</a>
        </div>
      `);
      state.markers.push(marker);
      bounds.push([ev.coords.lat, ev.coords.lng]);
    });
    if (bounds.length) state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
    setTimeout(() => state.map.invalidateSize(), 50);
  }

  // ---------- View switching ----------
  function setView(name) {
    state.view = name;
    els.viewTabs.forEach(t => {
      const active = t.dataset.view === name;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    els.navLinks.forEach(a => {
      const target = (a.getAttribute('href') || '').replace('#', '');
      // top-nav uses 'grid' label as 'Events'; map nav anchors to view names
      const matches = (target === 'grid' && name === 'grid')
        || (target === 'calendar' && name === 'calendar')
        || (target === 'map' && name === 'map');
      a.classList.toggle('active', matches);
    });
    [
      ['view-grid', 'grid'], ['view-visual', 'visual'],
      ['view-calendar', 'calendar'], ['view-map', 'map']
    ].forEach(([id, v]) => {
      const el = document.getElementById(id);
      el.hidden = v !== name;
      el.classList.toggle('active', v === name);
    });
    renderCurrentView();
  }

  function renderCurrentView() {
    if (state.view === 'grid') renderGrid();
    else if (state.view === 'visual') renderVisualGrid();
    else if (state.view === 'calendar') renderCalendar();
    else if (state.view === 'map') renderMap();
  }

  // ---------- Header search overlay (image-first quick search) ----------
  function toggleSearchPanel(force) {
    const open = force ?? els.searchPanel.hidden;
    els.searchPanel.hidden = !open;
    els.searchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) setTimeout(() => els.searchInput.focus(), 20);
    else els.searchInput.value = '';
  }
  function runQuickSearch() {
    const q = els.searchInput.value.trim().toLowerCase();
    if (!q) {
      els.searchResults.hidden = true;
      els.searchResults.innerHTML = '';
      return;
    }
    const hits = state.events.filter(e => {
      const hay = `${e.title} ${e.venue} ${e.city} ${e.category} ${e.shortDescription || ''}`.toLowerCase();
      return hay.includes(q);
    });
    els.searchResults.hidden = false;
    if (!hits.length) {
      els.searchResults.innerHTML = `<div class="search-empty">No events match "${escapeHtml(q)}".</div>`;
      return;
    }
    els.searchResults.innerHTML = hits.map(ev => {
      const img = ev.poster || ev.flyer || '';
      const { g, icon } = catStyle(ev.category);
      const fb = `<div class="card-fallback" style="background:linear-gradient(160deg,${g[0]} 0%,${g[1]} 100%)${img ? ';display:none' : ''}">
        <div class="fallback-icon" style="font-size:1.5rem">${icon}</div>
      </div>`;
      const imgTag = img
        ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(ev.title)}" loading="lazy"
               onerror="this.style.display='none';this.previousElementSibling.style.display='flex'" />`
        : '';
      return `
        <a class="search-card" href="event.html?id=${encodeURIComponent(ev.id)}" title="${escapeHtml(ev.title)}">
          ${fb}${imgTag}
          <div class="label">${escapeHtml(ev.title)}</div>
        </a>`;
    }).join('');
  }

  // ---------- Wire up ----------
  function init() {
    // Filters
    els.search.addEventListener('input', applyFilters);
    els.city.addEventListener('change', applyFilters);
    els.category.addEventListener('change', applyFilters);
    els.from.addEventListener('change', applyFilters);
    els.to.addEventListener('change', applyFilters);
    els.clear.addEventListener('click', () => {
      els.search.value = '';
      els.city.value = '';
      els.category.value = '';
      els.from.value = '';
      els.to.value = '';
      applyFilters();
    });

    // View tabs
    els.viewTabs.forEach(t => t.addEventListener('click', () => setView(t.dataset.view)));
    els.navLinks.forEach(a => a.addEventListener('click', (e) => {
      const name = (a.getAttribute('href') || '').replace('#', '');
      if (['grid','visual','calendar','map'].includes(name)) {
        e.preventDefault();
        setView(name);
      }
    }));

    // Calendar nav
    els.calPrev.addEventListener('click', () => {
      state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1);
      renderCalendar();
    });
    els.calNext.addEventListener('click', () => {
      state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1);
      renderCalendar();
    });

    // Header quick search
    els.searchToggle.addEventListener('click', () => toggleSearchPanel());
    els.searchInput.addEventListener('input', runQuickSearch);
    document.addEventListener('click', (e) => {
      if (els.searchPanel.hidden) return;
      if (!els.searchPanel.contains(e.target) && !els.searchToggle.contains(e.target)) {
        toggleSearchPanel(false);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !els.searchPanel.hidden) toggleSearchPanel(false);
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && els.searchPanel.hidden) {
        e.preventDefault();
        toggleSearchPanel(true);
      }
    });

    loadEvents();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
