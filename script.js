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
  const within002 = latestHistory ? (latestHistory.within_0_02 * 100).toFixed(1) : null;
  const within001 = latestHistory ? (latestHistory.within_0_01 * 100).toFixed(1) : null;
  const mae       = latestHistory ? latestHistory.mae : null;
  const r2        = latestHistory ? latestHistory.r2_score : null;

  function accColor(val, target) {
    if (val === null) return '';
    return parseFloat(val) >= target ? 'stat-good' : parseFloat(val) >= target * 0.75 ? 'stat-warn' : 'stat-bad';
  }

  function accValue(val) {
    return val !== null ? `${val}%` : '\u2014';
  }

  function accSub(val, target, label) {
    if (val === null) return 'Run a retrain to populate';
    const remaining = Math.max(0, target - parseFloat(val)).toFixed(1);
    return parseFloat(val) >= target
      ? `\u2713 Target of ${target}% reached`
      : `${remaining}% away from ${target}% target \u2022 ${label}`;
  }

  const cards = [
    {
      label: 'Total samples',
      value: total.toLocaleString(),
      sub: prefix === '/api' ? 'Across all profiles' : 'This profile',
    },
    {
      label: 'Accuracy within \u00b10.10 BAC',
      value: accValue(within010),
      sub: accSub(within010, 80, 'Advisor target'),
      cls: accColor(within010, 80),
    },
    {
      label: 'Accuracy within \u00b10.05 BAC',
      value: accValue(within005),
      sub: accSub(within005, 80, 'Clinical target'),
      cls: accColor(within005, 80),
    },
    {
      label: 'Accuracy within \u00b10.025 BAC',
      value: accValue(within002),
      sub: accSub(within002, 80, 'High precision target'),
      cls: accColor(within002, 80),
    },
    {
      label: 'Accuracy within \u00b10.01 BAC',
      value: accValue(within001),
      sub: accSub(within001, 80, 'Ultimate goal'),
      cls: accColor(within001, 80),
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
      sub: `${aboveLimit.toLocaleString()} of ${total.toLocaleString()} samples \u2022 target: 50%`,
      cls: aboveLimit / Math.max(total, 1) < 0.1 ? 'stat-bad' : aboveLimit / Math.max(total, 1) < 0.3 ? 'stat-warn' : 'stat-good',
    },
    {
      label: 'Flagged samples',
      value: (analytics.flagged_count ?? 0).toLocaleString(),
      sub: 'Marked for review by admin',
      cls: analytics.flagged_count > 0 ? 'stat-warn' : '',
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
  const bacCanvas = document.getElementById('bacChart');
  bacCanvas.parentElement.style.height = '260px';

  destroyChart('bac');
  charts.bac = new Chart(bacCanvas, {
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
  canvas.style.width = '100%';
  canvas.style.height = '260px';
  canvas.parentElement.style.height = '260px';
  emptyNote.hidden = true;

  // Populate latest retrain summary row
  const latest = history[history.length - 1];
  const summaryEl = document.getElementById('latest-retrain-summary');
  summaryEl.removeAttribute('hidden');
  summaryEl.style.display = 'block';

  function pct(val) { return val != null ? (val * 100).toFixed(1) + '%' : '—'; }
  function pctColor(val, target = 80) {
    if (val == null) return 'var(--text)';
    const p = val * 100;
    return p >= target ? 'var(--green)' : p >= target * 0.75 ? 'var(--amber)' : 'var(--red)';
  }

  document.getElementById('ls-010').textContent = pct(latest.within_0_10);
  document.getElementById('ls-010').style.color = pctColor(latest.within_0_10);
  document.getElementById('ls-005').textContent = pct(latest.within_0_05);
  document.getElementById('ls-005').style.color = pctColor(latest.within_0_05);
  document.getElementById('ls-002').textContent = pct(latest.within_0_02);
  document.getElementById('ls-002').style.color = pctColor(latest.within_0_02);
  document.getElementById('ls-001').textContent = pct(latest.within_0_01);
  document.getElementById('ls-001').style.color = pctColor(latest.within_0_01);
  document.getElementById('ls-mae').textContent = latest.mae != null ? latest.mae.toFixed(4) : '—';
  document.getElementById('ls-samples').textContent = latest.samples_used != null ? latest.samples_used.toLocaleString() : '—';

  const labels = history.map((_, i) => `v${i + 1}`);
  const within010 = history.map(h => (h.within_0_10 ?? 0) * 100);
  const within005 = history.map(h => (h.within_0_05 ?? 0) * 100);
  const within002 = history.map(h => (h.within_0_02 ?? 0) * 100);
  const within001 = history.map(h => (h.within_0_01 ?? 0) * 100);
  const target = history.map(() => 80);

  charts.history = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Within \u00b10.10 BAC',
          data: within010,
          borderColor: '#5fae4e',
          backgroundColor: 'rgba(95,174,78,0.08)',
          fill: false,
          tension: 0.3,
          pointRadius: 4,
        },
        {
          label: 'Within \u00b10.05 BAC',
          data: within005,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.08)',
          fill: false,
          tension: 0.3,
          pointRadius: 4,
        },
        {
          label: 'Within \u00b10.025 BAC',
          data: within002,
          borderColor: '#d99a2b',
          backgroundColor: 'rgba(217,154,43,0.08)',
          fill: false,
          tension: 0.3,
          pointRadius: 4,
        },
        {
          label: 'Within \u00b10.01 BAC (ultimate goal)',
          data: within001,
          borderColor: '#e1554f',
          backgroundColor: 'rgba(225,85,79,0.08)',
          fill: false,
          tension: 0.3,
          pointRadius: 4,
        },
        {
          label: 'Target (80%)',
          data: target,
          borderColor: '#56565e',
          borderDash: [4, 4],
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
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`,
          },
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

    // Load range accuracy separately — it's slow and shouldn't block the rest
    const rangeGrid = document.getElementById('range-accuracy-grid');
    rangeGrid.innerHTML = '<p class="no-data">Loading range accuracy\u2026 (this may take up to 60 seconds)</p>';
    fetchJSON(`${prefix}/range-accuracy`)
      .then(rangeAccuracy => renderRangeAccuracy(rangeAccuracy))
      .catch(err => {
        rangeGrid.innerHTML = `<p class="no-data">Could not load range accuracy: ${err.message}</p>`;
      });

    statusLine.textContent = '';
    lastUpdatedEl.textContent = new Date().toLocaleTimeString();
  } catch (err) {
    statusLine.textContent = `Error loading data: ${err.message}`;
  } finally {
    refreshBtn.disabled = false;
  }
}

function renderRangeAccuracy(data) {
  const grid = document.getElementById('range-accuracy-grid');
  const BAC_ORDER = ['0.00-0.02','0.02-0.04','0.04-0.06','0.06-0.08','0.08-0.10','0.10-0.12','0.12-0.14','0.14+'];

  function thresholdColor(val) {
    if (val === null) return 'var(--text-faint)';
    const pct = val * 100;
    if (pct >= 80) return 'var(--green)';
    if (pct >= 50) return 'var(--amber)';
    return 'var(--red)';
  }

  function fmt(val) {
    return val === null ? '—' : (val * 100).toFixed(1) + '%';
  }

  grid.innerHTML = BAC_ORDER.map(range => {
    const d = data[range];
    if (!d || d.sample_count === 0) {
      return `
        <div class="range-card">
          <p class="range-card-title">${range}</p>
          <p class="range-card-count">0 samples</p>
          <p class="no-data">No data collected yet</p>
        </div>`;
    }

    const thresholds = [
      { label: '±0.01', val: d.within_0_01 },
      { label: '±0.02', val: d.within_0_02 },
      { label: '±0.05', val: d.within_0_05 },
      { label: '±0.10', val: d.within_0_10 },
    ];

    return `
      <div class="range-card">
        <p class="range-card-title">${range} BAC</p>
        <p class="range-card-count">${d.sample_count.toLocaleString()} samples</p>
        ${thresholds.map(t => `
          <div class="range-threshold">
            <span class="range-threshold-label">${t.label}</span>
            <span class="range-threshold-value" style="color:${thresholdColor(t.val)}">${fmt(t.val)}</span>
          </div>`).join('')}
        <p class="range-mae">MAE: ${d.mae !== null ? d.mae.toFixed(4) : '—'}</p>
      </div>`;
  }).join('');
}
refreshBtn.addEventListener('click', loadData);

loadData();
