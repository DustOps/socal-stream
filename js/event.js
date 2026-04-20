/* SoCal Stream - event detail page */
(function () {
  'use strict';

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const container = document.getElementById('event-detail');

  function parseDate(s) {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function formatDateRange(a, b, short) {
    const s = parseDate(a), e = parseDate(b);
    const M = short ? MONTHS_SHORT : MONTHS;
    const sM = M[s.getMonth()], eM = M[e.getMonth()];
    const same = s.getTime() === e.getTime();
    if (same) return `${sM} ${s.getDate()}, ${s.getFullYear()}`;
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth())
      return `${sM} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
    if (s.getFullYear() === e.getFullYear())
      return `${sM} ${s.getDate()} – ${eM} ${e.getDate()}, ${s.getFullYear()}`;
    return `${sM} ${s.getDate()}, ${s.getFullYear()} – ${eM} ${e.getDate()}, ${e.getFullYear()}`;
  }
  function formatTime(t) {
    if (!t) return '';
    const [hh, mm] = t.split(':').map(Number);
    const h12 = ((hh + 11) % 12) + 1;
    return `${h12}:${mm.toString().padStart(2,'0')} ${hh < 12 ? 'AM' : 'PM'}`;
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  async function load() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) return renderError("No event specified.");
    try {
      const res = await fetch('data/events.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const events = await res.json();
      const ev = events.find(e => e.id === id);
      if (!ev) return renderError("We couldn't find that event. It may have been removed.");
      document.title = `${ev.title} — SoCal Stream`;
      render(ev);
    } catch (err) {
      console.error(err);
      renderError("Unable to load event data.");
    }
  }

  function renderError(msg) {
    container.innerHTML = `
      <a class="detail-back" href="index.html">← Back to events</a>
      <div class="detail-section full">
        <h2>${escapeHtml(msg)}</h2>
        <p>Return to <a href="index.html">browse all events</a>.</p>
      </div>`;
  }

  function render(ev) {
    const timeLine = ev.startTime
      ? `${formatTime(ev.startTime)}${ev.endTime ? ' – ' + formatTime(ev.endTime) : ''}`
      : '';
    const fullAddress = `${ev.address}, ${ev.city}, ${ev.state} ${ev.zip}`;
    const mapLink = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`;
    const bg = ev.flyer || ev.poster || '';

    container.innerHTML = `
      <a class="detail-back" href="index.html">← Back to events</a>

      <div class="detail-banner">
        ${bg ? `<div class="detail-banner-bg" style="background-image:url('${escapeHtml(bg)}')"></div>` : ''}
        <div class="detail-banner-overlay"></div>
        <div class="detail-banner-content">
          <span class="pill">${escapeHtml(ev.category)}</span>
          <h1>${escapeHtml(ev.title)}</h1>
          <div class="meta">
            <span>📅 <strong>${escapeHtml(formatDateRange(ev.startDate, ev.endDate))}</strong>${timeLine ? ` · ${escapeHtml(timeLine)}` : ''}</span>
            <span>📍 <strong>${escapeHtml(ev.venue)}</strong> · ${escapeHtml(ev.city)}, ${escapeHtml(ev.state)}</span>
            ${ev.price ? `<span>💰 <strong>From $${ev.price.from}</strong> ${escapeHtml(ev.price.label || '')}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="detail-cta-row">
        ${ev.ticketUrl
          ? `<a class="btn btn-lg" href="${escapeHtml(ev.ticketUrl)}" target="_blank" rel="noopener">🎟️ Buy tickets</a>`
          : ''}
        <a class="btn btn-secondary btn-lg" href="${escapeHtml(mapLink)}" target="_blank" rel="noopener">Get directions</a>
      </div>

      <div class="detail-grid">
        <div class="detail-section full">
          <h2><span class="icon">📖</span> About this event</h2>
          <p>${escapeHtml(ev.description || ev.shortDescription || '')}</p>
          ${ev.organizer ? `<p class="small dimmer">Organized by ${escapeHtml(ev.organizer)}</p>` : ''}
          ${ev.ageRestriction ? `<p class="small dimmer"><strong>Ages:</strong> ${escapeHtml(ev.ageRestriction)}</p>` : ''}
        </div>

        <div class="detail-section">
          <h2><span class="icon">🅿️</span> Parking</h2>
          <div class="info-item">
            <div class="info-label">On-site parking</div>
            <div>${ev.parking?.onSite ? 'Available' : 'Not available'}</div>
          </div>
          ${ev.parking?.notes ? `
          <div class="info-item">
            <div class="info-label">Details</div>
            <div>${escapeHtml(ev.parking.notes)}</div>
          </div>` : ''}
          ${ev.parking?.accessibleParking ? `
          <div class="info-item">
            <div class="info-label">Accessible parking</div>
            <div>${escapeHtml(ev.parking.accessibleParking)}</div>
          </div>` : ''}
        </div>

        <div class="detail-section">
          <h2><span class="icon">♿</span> Accessibility</h2>
          <div class="info-item">
            <div class="info-label">ADA accessible</div>
            <div>${ev.accessibility?.ada ? 'Yes' : 'Please contact venue'}</div>
          </div>
          ${ev.accessibility?.notes ? `
          <div class="info-item">
            <div class="info-label">Accommodations</div>
            <div>${escapeHtml(ev.accessibility.notes)}</div>
          </div>` : ''}
          ${ev.accessibility?.serviceAnimals !== undefined ? `
          <div class="info-item">
            <div class="info-label">Service animals</div>
            <div>${ev.accessibility.serviceAnimals ? 'Welcome' : 'Please contact venue'}</div>
          </div>` : ''}
        </div>

        ${ev.transit ? `
        <div class="detail-section">
          <h2><span class="icon">🚆</span> Public transit</h2>
          <p>${escapeHtml(ev.transit)}</p>
        </div>` : ''}

        <div class="detail-section full">
          <h2><span class="icon">🗺️</span> Location</h2>
          <p class="small dimmer">${escapeHtml(fullAddress)}</p>
          <div id="detail-map" class="detail-map"></div>
        </div>
      </div>
    `;

    if (ev.coords) {
      const map = L.map('detail-map').setView([ev.coords.lat, ev.coords.lng], 14);
      L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);
      L.marker([ev.coords.lat, ev.coords.lng]).addTo(map)
        .bindPopup(`<div class="popup-title">${escapeHtml(ev.venue)}</div>`).openPopup();
    } else {
      const mapEl = document.getElementById('detail-map');
      if (mapEl) mapEl.style.display = 'none';
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();
