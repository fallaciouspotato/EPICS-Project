/**
 * EPICS Sensor Swarm Dashboard — Client Controller
 * Clean, straight-edged, light industrial UI. Zero emojis. True Mesh Topology.
 */

// Initialize Socket.io
const socket = io();

// State store
let nodes = {
  1: { id: 1, name: 'Node 1', online: true, smoke: 120, flame: 0, tempObj: 26.0, tempAmb: 24.2, humidity: 55, rssi: -45, battery: 98, fireRisk: 2, parent: 0 },
  2: { id: 2, name: 'Node 2', online: true, smoke: 130, flame: 0, tempObj: 26.5, tempAmb: 24.5, humidity: 56, rssi: -60, battery: 91, fireRisk: 3, parent: 1 },
  3: { id: 3, name: 'Node 3', online: true, smoke: 115, flame: 0, tempObj: 25.8, tempAmb: 24.1, humidity: 57, rssi: -70, battery: 87, fireRisk: 1, parent: 2 }
};

let simState = {
  active: true,
  node2Fire: false,
  node1Smoke: false,
  node2Offline: false,
  node3Offline: false
};

let audioEnabled = true;
let audioContext = null;
let lastBeepTime = 0;
let alarmAcknowledged = false;

// Audio Buzzer using Web Audio API (Synthesizer tone, no external files)
function playAlarmBuzzer() {
  if (!audioEnabled || alarmAcknowledged) return;
  const now = Date.now();
  if (now - lastBeepTime < 1800) return;
  lastBeepTime = now;

  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, audioContext.currentTime);
    osc.frequency.setValueAtTime(440, audioContext.currentTime + 0.15);

    gain.gain.setValueAtTime(0.2, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start();
    osc.stop(audioContext.currentTime + 0.36);
  } catch (e) {
    console.warn('Audio playback error:', e);
  }
}

// Audio Toggle Button
const audioBtn = document.getElementById('audio-toggle-btn');
const audioLabel = document.getElementById('audio-toggle-label');
if (audioBtn) {
  audioBtn.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    audioLabel.textContent = `BUZZER: ${audioEnabled ? 'ON' : 'MUTED'}`;
    audioBtn.className = audioEnabled
      ? 'flex items-center space-x-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1.5 text-xs font-medium cursor-pointer'
      : 'flex items-center space-x-1.5 bg-slate-200 text-slate-500 border border-slate-300 px-3 py-1.5 text-xs font-medium cursor-pointer';
  });
}

// Alarm Acknowledge
document.getElementById('dismiss-alarm-btn')?.addEventListener('click', () => {
  alarmAcknowledged = true;
  document.getElementById('fire-alarm-banner').classList.add('hidden');
});

// Setup Chart.js (Strictly flat light theme, zero gradients)
const maxDataPoints = 25;
const chartLabels = Array(maxDataPoints).fill('');

// Temperature Chart
const tempCtx = document.getElementById('tempChart').getContext('2d');
const tempChart = new Chart(tempCtx, {
  type: 'line',
  data: {
    labels: [...chartLabels],
    datasets: [
      {
        label: 'Node 1 (Root)',
        data: Array(maxDataPoints).fill(26.0),
        borderColor: '#0f172a',
        borderWidth: 2,
        tension: 0,
        pointRadius: 2,
        fill: false
      },
      {
        label: 'Node 2 (Field)',
        data: Array(maxDataPoints).fill(26.5),
        borderColor: '#0284c7',
        borderWidth: 2,
        tension: 0,
        pointRadius: 2,
        fill: false
      },
      {
        label: 'Node 3 (Edge)',
        data: Array(maxDataPoints).fill(25.8),
        borderColor: '#059669',
        borderWidth: 2,
        tension: 0,
        pointRadius: 2,
        fill: false
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { boxWidth: 12, font: { family: 'JetBrains Mono', size: 10 } }
      }
    },
    scales: {
      x: {
        grid: { color: '#e2e8f0' },
        ticks: { display: false }
      },
      y: {
        grid: { color: '#e2e8f0' },
        ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#475569' },
        suggestedMin: 20,
        suggestedMax: 40
      }
    }
  }
});

// Smoke Chart
const smokeCtx = document.getElementById('smokeChart').getContext('2d');
const smokeChart = new Chart(smokeCtx, {
  type: 'line',
  data: {
    labels: [...chartLabels],
    datasets: [
      {
        label: 'Node 1 Smoke',
        data: Array(maxDataPoints).fill(120),
        borderColor: '#0f172a',
        borderWidth: 2,
        tension: 0,
        pointRadius: 2,
        fill: false
      },
      {
        label: 'Node 2 Smoke',
        data: Array(maxDataPoints).fill(130),
        borderColor: '#0284c7',
        borderWidth: 2,
        tension: 0,
        pointRadius: 2,
        fill: false
      },
      {
        label: 'Node 3 Smoke',
        data: Array(maxDataPoints).fill(115),
        borderColor: '#059669',
        borderWidth: 2,
        tension: 0,
        pointRadius: 2,
        fill: false
      },
      {
        label: 'Threshold (300)',
        data: Array(maxDataPoints).fill(300),
        borderColor: '#dc2626',
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { boxWidth: 12, font: { family: 'JetBrains Mono', size: 10 } }
      }
    },
    scales: {
      x: {
        grid: { color: '#e2e8f0' },
        ticks: { display: false }
      },
      y: {
        grid: { color: '#e2e8f0' },
        ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#475569' },
        suggestedMin: 50,
        suggestedMax: 400
      }
    }
  }
});

function updateCharts() {
  const t = new Date().toLocaleTimeString('en-GB');

  tempChart.data.labels.shift();
  tempChart.data.labels.push(t);
  tempChart.data.datasets[0].data.shift();
  tempChart.data.datasets[0].data.push(nodes[1].online ? nodes[1].tempObj : null);
  tempChart.data.datasets[1].data.shift();
  tempChart.data.datasets[1].data.push(nodes[2].online ? nodes[2].tempObj : null);
  tempChart.data.datasets[2].data.shift();
  tempChart.data.datasets[2].data.push(nodes[3].online ? nodes[3].tempObj : null);

  const maxTemp = Math.max(nodes[1].tempObj, nodes[2].tempObj, nodes[3].tempObj);
  tempChart.options.scales.y.suggestedMax = maxTemp > 35 ? Math.ceil(maxTemp + 10) : 40;
  tempChart.update();

  smokeChart.data.labels.shift();
  smokeChart.data.labels.push(t);
  smokeChart.data.datasets[0].data.shift();
  smokeChart.data.datasets[0].data.push(nodes[1].online ? nodes[1].smoke : null);
  smokeChart.data.datasets[1].data.shift();
  smokeChart.data.datasets[1].data.push(nodes[2].online ? nodes[2].smoke : null);
  smokeChart.data.datasets[2].data.shift();
  smokeChart.data.datasets[2].data.push(nodes[3].online ? nodes[3].smoke : null);

  const maxSmoke = Math.max(nodes[1].smoke, nodes[2].smoke, nodes[3].smoke);
  smokeChart.options.scales.y.suggestedMax = maxSmoke > 350 ? Math.ceil(maxSmoke + 100) : 400;
  smokeChart.update();
}

// Render DOM Node Cards
function updateNodeCard(node) {
  const id = node.id;
  const card = document.getElementById(`card-node-${id}`);
  const badge = document.getElementById(`badge-node-${id}`);
  if (!card || !badge) return;

  if (!node.online) {
    badge.className = 'text-[10px] font-mono font-bold px-2 py-0.5 bg-red-100 text-red-800 border border-red-300';
    badge.textContent = 'OFFLINE';
    card.classList.add('opacity-60');
    return;
  }

  card.classList.remove('opacity-60');

  if (node.fireRisk >= 60) {
    badge.className = 'text-[10px] font-mono font-bold px-2 py-0.5 bg-red-600 text-white border border-red-800 alarm-pulse';
    badge.textContent = 'CRITICAL FIRE';
  } else if (node.fireRisk >= 30) {
    badge.className = 'text-[10px] font-mono font-bold px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300';
    badge.textContent = 'WARNING';
  } else {
    badge.className = 'text-[10px] font-mono font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300';
    badge.textContent = 'ONLINE';
  }

  document.getElementById(`temp-obj-${id}`).textContent = `${node.tempObj.toFixed(1)}°C`;
  document.getElementById(`temp-amb-${id}`).textContent = `Amb: ${node.tempAmb.toFixed(1)}°C`;
  document.getElementById(`smoke-${id}`).textContent = node.smoke;

  const flameEl = document.getElementById(`flame-${id}`);
  if (node.flame === 1) {
    flameEl.textContent = 'TRIGGERED';
    flameEl.className = 'text-sm font-bold text-red-600';
  } else {
    flameEl.textContent = 'CLEAR';
    flameEl.className = 'text-sm font-bold text-emerald-700';
  }

  document.getElementById(`humid-${id}`).textContent = `${node.humidity.toFixed(1)}%`;
  document.getElementById(`rssi-${id}`).textContent = `${node.rssi} dBm`;
  document.getElementById(`bat-${id}`).textContent = `${node.battery}%`;

  const riskVal = document.getElementById(`risk-val-${id}`);
  const riskBar = document.getElementById(`risk-bar-${id}`);
  riskVal.textContent = `${node.fireRisk}%`;
  riskBar.style.width = `${node.fireRisk}%`;

  if (node.fireRisk >= 60) {
    riskBar.className = 'bg-red-600 h-full transition-all duration-300';
  } else if (node.fireRisk >= 30) {
    riskBar.className = 'bg-amber-500 h-full transition-all duration-300';
  } else {
    riskBar.className = 'bg-emerald-600 h-full transition-all duration-300';
  }
}

// Update Top KPI Summary
function updateKpis() {
  const onlineCount = Object.values(nodes).filter(n => n.online).length;
  document.getElementById('stat-active-nodes').textContent = `${onlineCount}/3`;

  let peakTemp = -999;
  let peakSmoke = -1;
  let maxRisk = 0;
  let riskyNode = null;

  Object.values(nodes).forEach(n => {
    if (n.online) {
      if (n.tempObj > peakTemp) peakTemp = n.tempObj;
      if (n.smoke > peakSmoke) peakSmoke = n.smoke;
      if (n.fireRisk > maxRisk) {
        maxRisk = n.fireRisk;
        riskyNode = n;
      }
    }
  });

  const tempEl = document.getElementById('stat-peak-temp');
  const tempTag = document.getElementById('stat-temp-tag');
  if (peakTemp > -999) {
    tempEl.textContent = `${peakTemp.toFixed(1)}°C`;
    if (peakTemp > 50) {
      tempTag.textContent = 'ELEVATED';
      tempTag.className = 'text-xs font-medium text-red-600 font-mono';
    } else {
      tempTag.textContent = 'NORMAL';
      tempTag.className = 'text-xs font-medium text-slate-500 font-mono';
    }
  }

  const smokeEl = document.getElementById('stat-peak-smoke');
  const smokeTag = document.getElementById('stat-smoke-tag');
  if (peakSmoke >= 0) {
    smokeEl.textContent = peakSmoke;
    if (peakSmoke > 300) {
      smokeTag.textContent = 'HIGH';
      smokeTag.className = 'text-xs font-medium text-red-600 font-mono';
    } else {
      smokeTag.textContent = 'BASELINE';
      smokeTag.className = 'text-xs font-medium text-slate-500 font-mono';
    }
  }

  // Fire Alert Banner
  const alarmBanner = document.getElementById('fire-alarm-banner');
  const alarmDetails = document.getElementById('alarm-banner-details');
  if (maxRisk >= 60 && !alarmAcknowledged) {
    alarmBanner.classList.remove('hidden');
    alarmDetails.textContent = `ALERT: Node ${riskyNode.id} reports ${riskyNode.tempObj.toFixed(1)}°C and smoke level ${riskyNode.smoke}. Fire risk calculated at ${maxRisk}%.`;
    playAlarmBuzzer();
  } else if (maxRisk < 60) {
    alarmAcknowledged = false;
    alarmBanner.classList.add('hidden');
  }
}

// Add Entry to Audit Table
function appendLog(log) {
  const tbody = document.getElementById('event-log-tbody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.className = 'border-b border-slate-200';

  let badgeClass = 'bg-slate-100 text-slate-700 border-slate-300';
  if (log.level === 'CRITICAL') badgeClass = 'bg-red-100 text-red-800 border-red-300 font-bold';
  if (log.level === 'WARN') badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
  if (log.level === 'RECOVERY') badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';

  const originText = log.nodeId ? `NODE-0${log.nodeId}` : 'GATEWAY';

  tr.innerHTML = `
    <td class="py-2 px-3 text-slate-500">${log.time}</td>
    <td class="py-2 px-3">
      <span class="inline-block px-1.5 py-0.5 text-[10px] border ${badgeClass}">${log.level}</span>
    </td>
    <td class="py-2 px-3 font-semibold text-slate-700">${originText}</td>
    <td class="py-2 px-3 text-slate-800">${log.message}</td>
  `;

  tbody.insertBefore(tr, tbody.firstChild);

  while (tbody.children.length > 50) {
    tbody.removeChild(tbody.lastChild);
  }
}

// Clear log button
document.getElementById('btn-clear-log')?.addEventListener('click', () => {
  const tbody = document.getElementById('event-log-tbody');
  if (tbody) tbody.innerHTML = '';
});

// =========================================================================
// TRIANGULAR MESH TOPOLOGY CANVAS (Proves Mesh & Dynamic Self-Healing)
// =========================================================================
const canvas = document.getElementById('topologyCanvas');
const ctx = canvas.getContext('2d');
let animPacket = 0;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 100);

function drawTopology() {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  // Triangular coordinates:
  // Station on far left, Node 1 in middle-left, Node 2 top-right, Node 3 bottom-right
  const posGateway = { x: 75, y: h / 2, label: 'HOST LAPTOP', sub: 'USB Serial Gateway' };
  const posNode1 = { x: w * 0.36, y: h / 2, label: 'NODE 01 (ROOT)', sub: 'Mesh Gateway', id: 1 };
  const posNode2 = { x: w * 0.76, y: h * 0.28, label: 'NODE 02', sub: 'Field Zone A', id: 2 };
  const posNode3 = { x: w * 0.76, y: h * 0.72, label: 'NODE 03', sub: 'Field Zone B', id: 3 };

  // Packet animation index (0 to 100)
  animPacket = (animPacket + 0.5) % 100;

  // 1. USB Wired Link: Laptop Station <-> Root Node 1
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#0f172a';
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(posGateway.x + 48, posGateway.y);
  ctx.lineTo(posNode1.x - 48, posNode1.y);
  ctx.stroke();

  // Packet moving on USB wire
  const wireX = (posGateway.x + 48) + ((posNode1.x - 48) - (posGateway.x + 48)) * (animPacket / 100);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(wireX - 3, posGateway.y - 3, 6, 6);

  // =======================================================================
  // 2. THE MESH TRIANGLE (3 Wireless Radio Paths)
  // =======================================================================

  // LINK 1: Node 1 (Root) <---> Node 2
  const link1Online = nodes[1].online && nodes[2].online;
  drawMeshEdge(posNode1, posNode2, link1Online, link1Online ? 'ACTIVE ROUTE' : 'DISCONNECTED', link1Online ? '#0284c7' : '#ef4444', link1Online, false);

  // LINK 2: Node 2 <---> Node 3 (Inter-Node Peer-to-Peer Mesh Link)
  const link2Online = nodes[2].online && nodes[3].online;
  drawMeshEdge(posNode2, posNode3, link2Online, link2Online ? 'PEER LINK (MULTI-HOP)' : 'PEER LINK BROKEN', link2Online ? '#059669' : '#ef4444', link2Online, false);

  // LINK 3: Node 1 (Root) <---> Node 3 (Direct / Self-Healing Reroute)
  // When Node 2 is alive, Link 3 is a STANDBY backup route.
  // When Node 2 fails, Link 3 dynamically BECOMES ACTIVE (Proving Self-Healing)!
  const node2Dead = !nodes[2].online;
  const link3Online = nodes[1].online && nodes[3].online;

  if (node2Dead && link3Online) {
    // SELF-HEALED ACTIVE ROUTE
    drawMeshEdge(posNode1, posNode3, true, 'SELF-HEALED (DIRECT)', '#d97706', true, false, 2.5);
  } else {
    // STANDBY BACKUP ROUTE (Shows professors that direct connection is available on standby)
    drawMeshEdge(posNode1, posNode3, true, 'STANDBY BACKUP ROUTE', '#94a3b8', false, true, 1.2);
  }

  // Draw Node Boxes (Crisp, strictly straight edges)
  drawBox(posGateway.x, posGateway.y, 96, 46, '#0f172a', '#ffffff', posGateway.label, posGateway.sub);
  drawNode(posNode1.x, posNode1.y, posNode1.label, `Temp: ${nodes[1].tempObj}°C`, nodes[1].online, nodes[1].fireRisk);
  drawNode(posNode2.x, posNode2.y, posNode2.label, `Temp: ${nodes[2].tempObj}°C`, nodes[2].online, nodes[2].fireRisk);
  drawNode(posNode3.x, posNode3.y, posNode3.label, `Temp: ${nodes[3].tempObj}°C`, nodes[3].online, nodes[3].fireRisk);

  requestAnimationFrame(drawTopology);
}

function drawMeshEdge(from, to, isConnected, labelText, strokeColor, showPackets, isDashed = false, strokeWidth = 2) {
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeColor;
  ctx.setLineDash(isDashed || !isConnected ? [5, 4] : []);

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Animated packet along link if active
  if (showPackets && isConnected) {
    const fraction = (animPacket / 100);
    const px = to.x + (from.x - to.x) * fraction;
    const py = to.y + (from.y - to.y) * fraction;
    ctx.fillStyle = strokeColor;
    ctx.fillRect(px - 3, py - 3, 6, 6);
  }

  // Midpoint label
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(midX - 44, midY - 8, 88, 16);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(midX - 44, midY - 8, 88, 16);

  ctx.fillStyle = isConnected ? (strokeColor === '#94a3b8' ? '#64748b' : strokeColor) : '#ef4444';
  ctx.font = 'bold 8px "JetBrains Mono"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(labelText, midX, midY);
}

function drawBox(x, y, w, h, bg, textCol, title, subtitle) {
  ctx.fillStyle = bg;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#334155';
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);

  ctx.fillStyle = textCol;
  ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, x, y - 6);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '8px "JetBrains Mono"';
  ctx.fillText(subtitle, x, y + 8);
}

function drawNode(x, y, title, subtitle, isOnline, fireRisk) {
  const w = 96;
  const h = 50;
  const isAlarm = fireRisk >= 60;

  let bg = '#ffffff';
  let border = '#1e293b';
  let textCol = '#0f172a';

  if (!isOnline) {
    bg = '#fee2e2';
    border = '#ef4444';
    textCol = '#991b1b';
  } else if (isAlarm) {
    bg = '#dc2626';
    border = '#991b1b';
    textCol = '#ffffff';
  }

  ctx.fillStyle = bg;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = border;
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);

  // Status indicator corner badge
  ctx.fillStyle = isOnline ? (isAlarm ? '#ffffff' : '#059669') : '#dc2626';
  ctx.fillRect(x + w / 2 - 8, y - h / 2 + 2, 6, 6);

  ctx.fillStyle = textCol;
  ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, x, y - 6);

  ctx.fillStyle = textCol === '#ffffff' ? '#fee2e2' : '#64748b';
  ctx.font = '8px "JetBrains Mono"';
  ctx.fillText(isOnline ? subtitle : 'OFFLINE', x, y + 8);
}

// Start rendering
requestAnimationFrame(drawTopology);

// =========================================================================
// DEMO CONTROLS (Self-healing & Fire trigger testing)
// =========================================================================
async function sendSimControl(action, value) {
  try {
    const res = await fetch('/api/sim/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, value })
    });
    const data = await res.json();
    updateSimButtonTags(data.simOverrides);
  } catch (err) {
    console.error('Sim control error:', err);
  }
}

function updateSimButtonTags(overrides) {
  const tagOffline = document.getElementById('tag-node2-offline');
  if (tagOffline) {
    tagOffline.textContent = overrides.node2Offline ? 'DEAD (HEALED 3->1)' : 'ONLINE';
    tagOffline.className = overrides.node2Offline ? 'font-mono text-[10px] text-amber-600 font-bold' : 'font-mono text-[10px] text-slate-500';
  }

  const tagFire = document.getElementById('tag-node2-fire');
  if (tagFire) {
    tagFire.textContent = overrides.node2Fire ? 'FIRE (75°C)' : 'NORMAL';
    tagFire.className = overrides.node2Fire ? 'font-mono text-[10px] text-red-600 font-bold' : 'font-mono text-[10px] text-slate-500';
  }

  const tagSmoke = document.getElementById('tag-node1-smoke');
  if (tagSmoke) {
    tagSmoke.textContent = overrides.node1Smoke ? 'SMOKE HIGH' : 'NORMAL';
    tagSmoke.className = overrides.node1Smoke ? 'font-mono text-[10px] text-amber-600 font-bold' : 'font-mono text-[10px] text-slate-500';
  }
}

document.getElementById('btn-trigger-offline')?.addEventListener('click', () => {
  simState.node2Offline = !simState.node2Offline;
  sendSimControl('node2Offline', simState.node2Offline);
});

document.getElementById('btn-trigger-fire')?.addEventListener('click', () => {
  simState.node2Fire = !simState.node2Fire;
  sendSimControl('node2Fire', simState.node2Fire);
});

document.getElementById('btn-trigger-smoke')?.addEventListener('click', () => {
  simState.node1Smoke = !simState.node1Smoke;
  sendSimControl('node1Smoke', simState.node1Smoke);
});

document.getElementById('btn-reset-all')?.addEventListener('click', () => {
  simState.node2Fire = false;
  simState.node1Smoke = false;
  simState.node2Offline = false;
  simState.node3Offline = false;
  sendSimControl('resetAll');
});

// =========================================================================
// SERIAL PORT CONTROLLER
// =========================================================================
async function refreshSerialPorts() {
  const select = document.getElementById('serial-port-select');
  if (!select) return;

  try {
    const res = await fetch('/api/serial/ports');
    const data = await res.json();
    select.innerHTML = '';

    if (!data.ports || data.ports.length === 0) {
      select.innerHTML = '<option value="">No COM Ports Detected</option>';
      return;
    }

    data.ports.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.path;
      opt.textContent = `${p.path} (${p.manufacturer || 'Serial Device'})`;
      select.appendChild(opt);
    });
  } catch (e) {
    select.innerHTML = '<option value="">Serial Scan Failed</option>';
  }
}
refreshSerialPorts();

document.getElementById('btn-serial-connect')?.addEventListener('click', async () => {
  const select = document.getElementById('serial-port-select');
  const portPath = select.value;
  const msgEl = document.getElementById('serial-msg');

  if (!portPath) {
    msgEl.textContent = 'Please choose a valid COM port.';
    msgEl.className = 'text-[11px] font-mono text-red-600 mt-1';
    return;
  }

  msgEl.textContent = `Connecting to ${portPath}...`;
  try {
    const res = await fetch('/api/serial/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: portPath, baudRate: 115200 })
    });
    const json = await res.json();
    if (json.success) {
      msgEl.textContent = `Connected to ${portPath} @ 115200`;
      msgEl.className = 'text-[11px] font-mono text-emerald-700 mt-1';
      document.getElementById('gateway-mode-label').textContent = `LIVE SERIAL (${portPath})`;
    } else {
      msgEl.textContent = `Error: ${json.error}`;
      msgEl.className = 'text-[11px] font-mono text-red-600 mt-1';
    }
  } catch (err) {
    msgEl.textContent = `Failed to connect: ${err.message}`;
    msgEl.className = 'text-[11px] font-mono text-red-600 mt-1';
  }
});

// =========================================================================
// SOCKET.IO EVENT HANDLERS
// =========================================================================
socket.on('init:state', data => {
  nodes = data.nodes;
  simState = data.simOverrides;
  Object.values(nodes).forEach(n => updateNodeCard(n));
  updateKpis();
  updateSimButtonTags(simState);

  if (data.eventLog) {
    data.eventLog.slice().reverse().forEach(l => appendLog(l));
  }
});

socket.on('telemetry:update', node => {
  nodes[node.id] = node;
  updateNodeCard(node);
  updateKpis();
  updateCharts();
});

socket.on('node:status', data => {
  if (nodes[data.id]) {
    nodes[data.id].online = data.online;
    updateNodeCard(nodes[data.id]);
    updateKpis();
  }
});

socket.on('log:new', log => {
  appendLog(log);
});

socket.on('sim:state', state => {
  simState = state;
  updateSimButtonTags(state);
});

socket.on('serial:status', status => {
  const dot = document.getElementById('gateway-status-dot');
  const label = document.getElementById('gateway-mode-label');
  if (status.connected) {
    dot.className = 'w-2.5 h-2.5 bg-emerald-600 inline-block';
    label.textContent = `LIVE SERIAL (${status.port})`;
  } else {
    dot.className = 'w-2.5 h-2.5 bg-blue-600 inline-block';
    label.textContent = 'SIMULATED MESH';
  }
});
