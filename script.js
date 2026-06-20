const API_BASE = 'https://18.188.109.192.nip.io';
const GAP_TARGET = 1250; // recommended minimum samples per BAC bucket
const BAC_ORDER = ['0.00-0.02', '0.02-0.04', '0.04-0.06', '0.06-0.08', '0.08-0.10', '0.10-0.12', '0.12-0.14', '0.14+'];

const profileSelect = document.getElementById('profile-select');
const refreshBtn = document.getElementById('refresh-btn');
const statusLine = document.getElementById('status-line');
const statGrid = document.getElementById('stat-grid');
const gapTargetEl = document.getElementById('gap-target');
const apiBaseEl = document.getElementById('api-base');
const lastUpdatedEl = document.getElementById('last-updated');

gapTargetEl.textContent = GAP_TARGET;
apiBaseEl.textContent = API_BASE;

let charts = {};

async function fetchJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

function bacBarColor(count) {
  if (count >= GAP_TARGET) return '#5fae4e';
  if (count >= GAP_TARGET * 0.5) return '#d99a2b';
  return '#e1554f';
}

function renderStats(prefix, status, analytics, latestHistory) {
  const total = analytics.total_samples ?? 0;
  const aboveLimit = ['0.08-0.10', '0.10-0.12', '0.12-0.14', '0.14+']
    .reduce((sum, key) => sum + (analytics.bac_distribution[key] || 0), 0);
  const pctAboveLimit = total ? ((aboveLimit / total) * 100).toFixed(1) : '0.0';

  const within010 = latestHistory ? (latestHistory.within_0_10 * 100).toFixed(1) : null;
  const within005 = latestHistory ? (latestHistory.within_0_05 * 100).toFixed(1) : null;
  const mae       = latestHistory ? latestHistory.mae : null;
  const r2        = latestHistory ? latestHistory.r2_score : null;
  const r2cls     = r2 === null ? '' : r2 >= 0.5 ? 'stat-good' : r2 >= 0 ? 'stat-warn' : 'stat-bad';
  const accCls    = within010 === null ? '' : within010 >= 80 ? 'stat-good' : within010 >= 60 ? 'stat-warn' : 'stat-bad';

  const cards = [
    {
      label: 'Total samples',
      value: total.toLocaleString(),
      sub: prefix === '/api' ? 'Across all profiles' : 'This profile',
    },
    {
      label: 'Accuracy within \u00b10.10 BAC',
      value: within010 !== null ? `${within010}%` : '\u2014',
      sub: within010 !== null ? `Target: 80% \u2022 within \u00b10.05: ${within005}%` : 'Run a retrain to populate',
      cls: accCls,
    },
    {
      label: 'Mean abs. error (MAE)',
      value: mae !== null ? mae.toFixed(4) : '\u2014',
      sub: mae !== null
        ? `R\u00b2 score: ${r2.toFixed(4)}${r2 < 0 ? ' \u26a0\ufe0f needs more impaired data' : ''}`
        : 'Run a retrain to populate',
      cls: mae !== null ? (mae < 0.03 ? 'stat-good' : mae < 0.06 ? 'stat-warn' : 'stat-bad') : '',
    },
    {
      label: 'Samples \u2265 legal limit (0.08)',
      value: `${pctAboveLimit}%`,
      sub: `${aboveLimit.toLocaleString()} of ${total.toLocaleString()} samples`,
      cls: aboveLimit / Math.max(total, 1) < 0.1 ? 'stat-warn' : '',
    },
  ];

  statGrid.innerHTML = cards.map(c => `
    <div class="stat-card">
      <p class="stat-label">${c.label}</p>
      <p class="stat-value ${c.cls || ''}">${c.value}</p>
      <p class="stat-sub">${c.sub}</p>
    </div>
  `).join('');
}

function renderBacChart(analytics) {
  const dist = analytics.bac_distribution || {};
  const data = BAC_ORDER.map(k => dist[k] || 0);
  const colors = data.map(bacBarColor);

  destroyChart('bac');
  charts.bac = new Chart(document.getElementById('bacChart'), {
    type: 'bar',
    data: {
      labels: BAC_ORDER,
      datasets: [
        {
          label: 'Samples collected',
          data,
          backgroundColor: colors,
          borderRadius: 4,
          maxBarThickness: 56,
          order: 2,
        },
        {
          label: `Target (${GAP_TARGET.toLocaleString()})`,
          data: BAC_ORDER.map(() => GAP_TARGET),
          type: 'line',
          borderColor: '#8d8d96',
          borderDash: [4, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#8d8d96', boxWidth: 10, boxHeight: 10, font: { size: 11 } },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8d8d96' } },
        y: {
          grid: { color: '#232328' },
          ticks: { color: '#8d8d96', precision: 0 },
          max: GAP_TARGET * 1.08,
        },
      },
    },
  });
}

function renderHistoryChart(history) {
  const emptyNote = document.getElementById('history-empty');
  const canvas = document.getElementById('historyChart');
  destroyChart('history');

  if (!history || history.length === 0) {
    canvas.style.display = 'none';
    emptyNote.hidden = false;
    return;
  }

  canvas.style.display = 'block';
  emptyNote.hidden = true;

  const labels = history.map((_, i) => `v${i + 1}`);
  const within010 = history.map(h => (h.within_0_10 ?? 0) * 100);
  const within005 = history.map(h => (h.within_0_05 ?? 0) * 100);
  const target = history.map(() => 80);

  charts.history = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Within \u00b10.10 BAC',
          data: within010,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
        },
        {
          label: 'Within \u00b10.05 BAC',
          data: within005,
          borderColor: '#8d8d96',
          borderDash: [4, 4],
          fill: false,
          tension: 0.3,
          pointRadius: 3,
        },
        {
          label: 'Target (80%)',
          data: target,
          borderColor: '#e1554f',
          borderDash: [3, 3],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#8d8d96', boxWidth: 10, boxHeight: 10, font: { size: 11 } },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8d8d96' } },
        y: {
          grid: { color: '#232328' },
          ticks: { color: '#8d8d96', callback: v => v + '%' },
          min: 0,
          max: 100,
        },
      },
    },
  });
}

function renderTagChart(canvasId, emptyId, key, tagData, accentColor) {
  const emptyNote = document.getElementById(emptyId);
  const canvas = document.getElementById(canvasId);
  destroyChart(key);

  const entries = Object.entries(tagData || {}).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    canvas.style.display = 'none';
    emptyNote.hidden = false;
    return;
  }

  canvas.style.display = 'block';
  emptyNote.hidden = true;

  charts[key] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{
        data: entries.map(e => e[1]),
        backgroundColor: accentColor,
        borderRadius: 4,
        maxBarThickness: 28,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#232328' }, ticks: { color: '#8d8d96', precision: 0 } },
        y: { grid: { display: false }, ticks: { color: '#8d8d96', font: { size: 11 } } },
      },
    },
  });
}

function renderProfileChart(profileCounts) {
  const card = document.getElementById('profile-card');
  const entries = Object.entries(profileCounts || {});
  destroyChart('profile');

  if (entries.length <= 1) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  entries.sort((a, b) => b[1] - a[1]);

  charts.profile = new Chart(document.getElementById('profileChart'), {
    type: 'bar',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{
        data: entries.map(e => e[1]),
        backgroundColor: '#3b82f6',
        borderRadius: 4,
        maxBarThickness: 36,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8d8d96' } },
        y: { grid: { color: '#232328' }, ticks: { color: '#8d8d96', precision: 0 } },
      },
    },
  });
}

async function loadData() {
  const prefix = profileSelect.value;
  statusLine.textContent = 'Loading data\u2026';
  refreshBtn.disabled = true;

  try {
    const [status, analytics, history] = await Promise.all([
      fetchJSON(`${prefix}/status`),
      fetchJSON(`${prefix}/analytics`),
      fetchJSON(`${prefix}/model-history`),
    ]);

    const latestHistory = history && history.length > 0 ? history[history.length - 1] : null;
    renderStats(prefix, status, analytics, latestHistory);
    renderBacChart(analytics);
    renderHistoryChart(history);
    renderTagChart('environmentChart', 'environment-empty', 'environment', analytics.environment, '#3b82f6');
    renderTagChart('noiseChart', 'noise-empty', 'noise', analytics.noise, '#d99a2b');
    renderTagChart('behaviorChart', 'behavior-empty', 'behavior', analytics.behavior, '#5fae4e');
    renderProfileChart(analytics.profile_counts);

    statusLine.textContent = '';
    lastUpdatedEl.textContent = new Date().toLocaleTimeString();
  } catch (err) {
    statusLine.textContent = `Error loading data: ${err.message}`;
  } finally {
    refreshBtn.disabled = false;
  }
}

profileSelect.addEventListener('change', loadData);
refreshBtn.addEventListener('click', loadData);

loadData();
