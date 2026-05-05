import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const d = JSON.parse(fs.readFileSync(path.join(root, 'whoop-data-dump.json'), 'utf-8'));

const recovery = [...d.recovery].filter(r => r.score).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
const cycles = [...d.cycles].filter(c => c.score && c.end).sort((a, b) => new Date(a.start) - new Date(b.start));
const sleep = [...d.sleep].filter(s => s.score && !s.nap).sort((a, b) => new Date(a.start) - new Date(b.start));
const workouts = [...d.workouts].filter(w => w.score).sort((a, b) => new Date(a.start) - new Date(b.start));

const sportColors = {
  'barrys': '#ef4444', 'functional-fitness': '#f97316', 'hiit': '#f59e0b',
  'cycling': '#3b82f6', 'running': '#8b5cf6', 'yoga': '#10b981',
  'weightlifting': '#06b6d4', 'walking': '#6b7280', 'commuting': '#9ca3af',
};
const defaultColor = '#a78bfa';

const fmt = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const milli2h = m => +(m / 3600000).toFixed(2);
const avg = arr => (arr.reduce((a, b) => a + b, 0) / arr.length);

const user = d.user_profile;
const body = d.body_measurement;

const recoveryDates = recovery.map(r => fmt(r.created_at));
const recoveryScores = recovery.map(r => r.score.recovery_score);
const hrv = recovery.map(r => +r.score.hrv_rmssd_milli.toFixed(1));
const rhr = recovery.map(r => r.score.resting_heart_rate);

const cycleDates = cycles.map(c => fmt(c.start));
const strain = cycles.map(c => +c.score.strain.toFixed(2));
const calories = cycles.map(c => Math.round(c.score.kilojoule / 4.184));

const sleepDates = sleep.map(s => fmt(s.start));
const sleepPerf = sleep.map(s => s.score.sleep_performance_percentage);
const remH = sleep.map(s => milli2h(s.score.stage_summary.total_rem_sleep_time_milli));
const swsH = sleep.map(s => milli2h(s.score.stage_summary.total_slow_wave_sleep_time_milli));
const lightH = sleep.map(s => milli2h(s.score.stage_summary.total_light_sleep_time_milli));
const awakeH = sleep.map(s => milli2h(s.score.stage_summary.total_awake_time_milli));

const LOW_STRAIN_SPORTS = new Set(['walking', 'commuting']);
const workoutsFiltered = workouts.filter(w => !LOW_STRAIN_SPORTS.has(w.sport_name));

const wDates = workoutsFiltered.map(w => fmt(w.start));
const wStrain = workoutsFiltered.map(w => +w.score.strain.toFixed(2));
const wSports = workoutsFiltered.map(w => w.sport_name);
const wColors = wSports.map(s => sportColors[s] || defaultColor);
const wLabels = wDates.map((d, i) => `${d} · ${wSports[i].replace(/-/g, ' ')}`);
const wAvgHR = workoutsFiltered.map(w => w.score.average_heart_rate);
const wMaxHR = workoutsFiltered.map(w => w.score.max_heart_rate);
const milli2min = m => +(m / 60000).toFixed(1);
const wZone0 = workoutsFiltered.map(w => milli2min(w.score.zone_durations.zone_zero_milli));
const wZone1 = workoutsFiltered.map(w => milli2min(w.score.zone_durations.zone_one_milli));
const wZone2 = workoutsFiltered.map(w => milli2min(w.score.zone_durations.zone_two_milli));
const wZone3 = workoutsFiltered.map(w => milli2min(w.score.zone_durations.zone_three_milli));
const wZone4 = workoutsFiltered.map(w => milli2min(w.score.zone_durations.zone_four_milli));
const wZone5 = workoutsFiltered.map(w => milli2min(w.score.zone_durations.zone_five_milli));

const sleepConsistency = sleep.map(s => s.score.sleep_consistency_percentage);
const respiratoryRate = sleep.map(s => +s.score.respiratory_rate.toFixed(1));

const sportCount = {};
workouts.forEach(w => { sportCount[w.sport_name] = (sportCount[w.sport_name] || 0) + 1; });
const sportEntries = Object.entries(sportCount).sort((a, b) => b[1] - a[1]);

const avgRecovery = avg(recoveryScores).toFixed(0);
const avgHRV = avg(hrv).toFixed(1);
const avgRHR = avg(rhr).toFixed(1);
const avgStrain = avg(strain).toFixed(1);
const avgSleepPerf = avg(sleepPerf).toFixed(0);
const avgCalories = avg(calories).toFixed(0);

const sportListHTML = sportEntries.map(([sport, count]) => `
  <li>
    <span class="sport-name">
      <span class="sport-dot" style="background:${sportColors[sport] || defaultColor}"></span>
      ${sport.replace(/-/g, ' ')}
    </span>
    <span class="sport-count">${count} session${count > 1 ? 's' : ''}</span>
  </li>`).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WHOOP Data — ${user.first_name} ${user.last_name}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0f; color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 2rem; }
  h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
  .subtitle { color: #6b7280; font-size: 0.875rem; margin-bottom: 2rem; }
  .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 1rem; margin-bottom: 2rem; }
  .stat { background: #111118; border: 1px solid #1f2937; border-radius: 12px; padding: 1.25rem; }
  .stat-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 0.5rem; }
  .stat-value { font-size: 2rem; font-weight: 800; }
  .stat-unit { font-size: 0.75rem; color: #9ca3af; margin-left: 2px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }
  .grid-3 { display: grid; grid-template-columns: 3fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }
  .card { background: #111118; border: 1px solid #1f2937; border-radius: 12px; padding: 1.5rem; }
  .card-title { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 1.25rem; }
  canvas { max-height: 220px; }
  .sport-list { list-style: none; }
  .sport-list li { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #1f2937; font-size: 0.875rem; }
  .sport-list li:last-child { border-bottom: none; }
  .sport-dot { width: 8px; height: 8px; border-radius: 50%; margin-right: 0.6rem; display: inline-block; flex-shrink: 0; }
  .sport-name { display: flex; align-items: center; text-transform: capitalize; }
  .sport-count { color: #9ca3af; font-size: 0.75rem; }
  .body-stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; margin-top: 1rem; }
  .body-stat { text-align: center; }
  .body-stat-val { font-size: 1.25rem; font-weight: 700; }
  .body-stat-label { font-size: 0.7rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .section-label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #4b5563; border-bottom: 1px solid #1f2937; padding-bottom: 0.5rem; margin-bottom: 1.25rem; }
</style>
</head>
<body>

<h1>${user.first_name} ${user.last_name}</h1>
<p class="subtitle">WHOOP data &middot; last 25 days (Apr 8 – May 3, 2026)</p>

<div class="stats">
  <div class="stat">
    <div class="stat-label">Avg Recovery</div>
    <div class="stat-value" style="color:#00ff87">${avgRecovery}<span class="stat-unit">%</span></div>
  </div>
  <div class="stat">
    <div class="stat-label">Avg HRV</div>
    <div class="stat-value" style="color:#3b82f6">${avgHRV}<span class="stat-unit">ms</span></div>
  </div>
  <div class="stat">
    <div class="stat-label">Avg RHR</div>
    <div class="stat-value" style="color:#f97316">${avgRHR}<span class="stat-unit">bpm</span></div>
  </div>
  <div class="stat">
    <div class="stat-label">Avg Strain</div>
    <div class="stat-value" style="color:#a78bfa">${avgStrain}</div>
  </div>
  <div class="stat">
    <div class="stat-label">Avg Sleep Perf</div>
    <div class="stat-value" style="color:#06b6d4">${avgSleepPerf}<span class="stat-unit">%</span></div>
  </div>
  <div class="stat">
    <div class="stat-label">Avg Daily Calories</div>
    <div class="stat-value" style="color:#f43f5e">${avgCalories}<span class="stat-unit">kcal</span></div>
  </div>
</div>

<div class="section-label">Recovery</div>
<div class="grid">
  <div class="card">
    <div class="card-title">Recovery Score</div>
    <canvas id="recoveryChart"></canvas>
  </div>
  <div class="card">
    <div class="card-title">HRV &amp; Resting Heart Rate</div>
    <canvas id="hrvChart"></canvas>
  </div>
</div>

<div class="section-label">Sleep</div>
<div class="grid">
  <div class="card">
    <div class="card-title">Sleep Performance</div>
    <canvas id="sleepPerfChart"></canvas>
  </div>
  <div class="card">
    <div class="card-title">Sleep Consistency &amp; Respiratory Rate</div>
    <canvas id="sleepConsistencyChart"></canvas>
  </div>
</div>
<div class="card" style="margin-bottom:1.5rem">
  <div class="card-title">Sleep Stages (hours per night)</div>
  <canvas id="sleepStagesChart" style="max-height:220px"></canvas>
</div>

<div class="section-label">Strain &amp; Activity</div>
<div class="grid">
  <div class="card">
    <div class="card-title">Daily Strain</div>
    <canvas id="strainChart"></canvas>
  </div>
  <div class="card">
    <div class="card-title">Daily Calories Burned (kcal)</div>
    <canvas id="caloriesChart"></canvas>
  </div>
</div>
<div class="grid">
  <div class="card">
    <div class="card-title">Workout Strain by Session</div>
    <canvas id="workoutChart"></canvas>
  </div>
  <div class="card">
    <div class="card-title">Avg &amp; Max Heart Rate per Workout</div>
    <canvas id="workoutHRChart"></canvas>
  </div>
</div>
<div class="card" style="margin-bottom:1.5rem">
  <div class="card-title">Heart Rate Zones per Workout (minutes)</div>
  <canvas id="zonesChart" style="max-height:220px"></canvas>
</div>

<div class="section-label">Profile</div>
<div class="grid-3" style="margin-bottom:2rem">
  <div class="card">
    <div class="card-title">Workouts by Activity</div>
    <ul class="sport-list">${sportListHTML}</ul>
  </div>
  <div class="card">
    <div class="card-title">Body Measurements</div>
    <div class="body-stats">
      <div class="body-stat">
        <div class="body-stat-val">${(body.height_meter * 100).toFixed(0)}<span style="font-size:.75rem;color:#9ca3af"> cm</span></div>
        <div class="body-stat-label">Height</div>
      </div>
      <div class="body-stat">
        <div class="body-stat-val">${body.weight_kilogram.toFixed(1)}<span style="font-size:.75rem;color:#9ca3af"> kg</span></div>
        <div class="body-stat-label">Weight</div>
      </div>
      <div class="body-stat">
        <div class="body-stat-val">${body.max_heart_rate}<span style="font-size:.75rem;color:#9ca3af"> bpm</span></div>
        <div class="body-stat-label">Max HR</div>
      </div>
    </div>
  </div>
</div>

<script>
Chart.defaults.color = '#6b7280';
Chart.defaults.borderColor = '#1f2937';

const tooltip = {
  backgroundColor: '#1a1a2e',
  borderColor: '#374151',
  borderWidth: 1,
  titleColor: '#e5e7eb',
  bodyColor: '#9ca3af',
  padding: 10,
};

new Chart(document.getElementById('recoveryChart'), {
  type: 'line',
  data: {
    labels: ${JSON.stringify(recoveryDates)},
    datasets: [{
      label: 'Recovery %',
      data: ${JSON.stringify(recoveryScores)},
      borderColor: '#00ff87',
      backgroundColor: 'rgba(0,255,135,0.08)',
      fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#00ff87',
    }]
  },
  options: { plugins: { legend: { display: false }, tooltip }, scales: { y: { min: 0, max: 100 } }, responsive: true, maintainAspectRatio: true }
});

new Chart(document.getElementById('hrvChart'), {
  type: 'line',
  data: {
    labels: ${JSON.stringify(recoveryDates)},
    datasets: [
      { label: 'HRV (ms)', data: ${JSON.stringify(hrv)}, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true, tension: 0.4, pointRadius: 3, yAxisID: 'y' },
      { label: 'RHR (bpm)', data: ${JSON.stringify(rhr)}, borderColor: '#f97316', tension: 0.4, pointRadius: 3, yAxisID: 'y2' }
    ]
  },
  options: { plugins: { tooltip }, scales: { y: { position: 'left' }, y2: { position: 'right', grid: { drawOnChartArea: false } } }, responsive: true, maintainAspectRatio: true }
});

new Chart(document.getElementById('strainChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(cycleDates)},
    datasets: [{ label: 'Strain', data: ${JSON.stringify(strain)}, backgroundColor: 'rgba(167,139,250,0.7)', borderColor: '#a78bfa', borderWidth: 1, borderRadius: 4 }]
  },
  options: { plugins: { legend: { display: false }, tooltip }, scales: { y: { min: 0, max: 21 } }, responsive: true, maintainAspectRatio: true }
});

new Chart(document.getElementById('sleepPerfChart'), {
  type: 'line',
  data: {
    labels: ${JSON.stringify(sleepDates)},
    datasets: [{
      label: 'Sleep Performance %',
      data: ${JSON.stringify(sleepPerf)},
      borderColor: '#06b6d4',
      backgroundColor: 'rgba(6,182,212,0.08)',
      fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#06b6d4',
    }]
  },
  options: { plugins: { legend: { display: false }, tooltip }, scales: { y: { min: 0, max: 100 } }, responsive: true, maintainAspectRatio: true }
});

new Chart(document.getElementById('sleepStagesChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(sleepDates)},
    datasets: [
      { label: 'REM', data: ${JSON.stringify(remH)}, backgroundColor: '#6366f1' },
      { label: 'Deep (SWS)', data: ${JSON.stringify(swsH)}, backgroundColor: '#0ea5e9' },
      { label: 'Light', data: ${JSON.stringify(lightH)}, backgroundColor: '#334155' },
      { label: 'Awake', data: ${JSON.stringify(awakeH)}, backgroundColor: '#374151' },
    ]
  },
  options: {
    plugins: { tooltip },
    scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'hours' } } },
    responsive: true, maintainAspectRatio: true
  }
});

new Chart(document.getElementById('caloriesChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(cycleDates)},
    datasets: [{ label: 'kcal', data: ${JSON.stringify(calories)}, backgroundColor: 'rgba(244,63,94,0.7)', borderColor: '#f43f5e', borderWidth: 1, borderRadius: 4 }]
  },
  options: { plugins: { legend: { display: false }, tooltip }, responsive: true, maintainAspectRatio: true }
});

new Chart(document.getElementById('workoutChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(wLabels)},
    datasets: [{ label: 'Strain', data: ${JSON.stringify(wStrain)}, backgroundColor: ${JSON.stringify(wColors)}, borderRadius: 4 }]
  },
  options: { plugins: { legend: { display: false }, tooltip }, responsive: true, maintainAspectRatio: true }
});

new Chart(document.getElementById('zonesChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(wLabels)},
    datasets: [
      { label: 'Zone 0 (rest)',    data: ${JSON.stringify(wZone0)}, backgroundColor: '#1e293b' },
      { label: 'Zone 1 (warm-up)', data: ${JSON.stringify(wZone1)}, backgroundColor: '#3b82f6' },
      { label: 'Zone 2 (easy)',    data: ${JSON.stringify(wZone2)}, backgroundColor: '#22c55e' },
      { label: 'Zone 3 (aerobic)',  data: ${JSON.stringify(wZone3)}, backgroundColor: '#f59e0b' },
      { label: 'Zone 4 (threshold)',data: ${JSON.stringify(wZone4)}, backgroundColor: '#f97316' },
      { label: 'Zone 5 (max)',     data: ${JSON.stringify(wZone5)}, backgroundColor: '#ef4444' },
    ]
  },
  options: {
    plugins: { tooltip },
    scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'minutes' } } },
    responsive: true, maintainAspectRatio: true
  }
});

new Chart(document.getElementById('workoutHRChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(wLabels)},
    datasets: [
      { label: 'Avg HR (bpm)', data: ${JSON.stringify(wAvgHR)}, backgroundColor: 'rgba(251,113,133,0.7)', borderColor: '#fb7185', borderWidth: 1, borderRadius: 4 },
      { label: 'Max HR (bpm)', data: ${JSON.stringify(wMaxHR)}, backgroundColor: 'rgba(244,63,94,0.4)',  borderColor: '#f43f5e', borderWidth: 1, borderRadius: 4 },
    ]
  },
  options: { plugins: { tooltip }, scales: { y: { min: 40 } }, responsive: true, maintainAspectRatio: true }
});

new Chart(document.getElementById('sleepConsistencyChart'), {
  type: 'line',
  data: {
    labels: ${JSON.stringify(sleepDates)},
    datasets: [
      { label: 'Consistency %', data: ${JSON.stringify(sleepConsistency)}, borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.08)', fill: true, tension: 0.4, pointRadius: 3, yAxisID: 'y' },
      { label: 'Resp. Rate (brpm)', data: ${JSON.stringify(respiratoryRate)}, borderColor: '#34d399', tension: 0.4, pointRadius: 3, yAxisID: 'y2' },
    ]
  },
  options: {
    plugins: { tooltip },
    scales: {
      y:  { position: 'left',  min: 0, max: 100, title: { display: true, text: '%' } },
      y2: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'brpm' } }
    },
    responsive: true, maintainAspectRatio: true
  }
});
</script>
</body>
</html>`;

fs.writeFileSync(path.join(root, 'whoop-viz.html'), html);
console.log('Written: whoop-viz.html');
