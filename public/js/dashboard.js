/**
 * EPICS Sensor Swarm Dashboard — Hardware Controller (Real Data Only)
 * Zero simulation. Real MQ-2 Smoke, KY-026 Flame, and Fire states.
 */

const socket = io();

// Real Hardware Node States
let nodes = {
  1: { id: 1, name: 'Node 1 (Root Gateway)', online: false, smoke: 0, flame: 0, fire: 0, lastSeen: null },
  2: { id: 2, name: 'Node 2 (Field Mesh)', online: false, smoke: 0, flame: 0, fire: 0, lastSeen: null },
  3: { id: 3, name: 'Node 3 (Field Mesh)', online: false, smoke: 0, flame: 0, fire: 0, lastSeen: null }
};

let audioEnabled = true;
let audioContext = null;
let lastBeepTime = 0;
let alarmAcknowledged = false;
let serialConnected = false;

// Audio Buzzer using Web Audio API
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

    gain.gain.setValueAtTime(0.25, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start();
    osc.stop(audioContext.currentTime + 0.36);
  } catch (e) {
    console.warn('Audio playback error:', e);
  }
}

// Audio Toggle
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

// Alarm Mute
document.getElementById('dismiss-alarm-btn')?.addEventListener('click', () => {
  alarmAcknowledged = true;
  document.getElementById('fire-alarm-banner').classList.add('hidden');
});

// =========================================================================
// REAL SMOKE DENSITY CHART (0 - 4095 ADC)
// =========================================================================
const maxDataPoints = 30;
const chartLabels = Array(maxDataPoints).fill('');

const smokeCtx = document.getElementById('smokeChart').getContext('2d');
const smokeChart = new Chart(smokeCtx, {
  type: 'line',
  data: {
    labels: [...chartLabels],
    datasets: [
      {
        label: 'Node 1 (Root Gateway)',
        data: Array(maxDataPoints).fill(0),
        borderColor: '#0f172a',
        borderWidth: 2,
        tension: 0,
        pointRadius: 2,
        fill: false
      },
      {
        label: 'Node 2 (Field Mesh)',
        data: Array(maxDataPoints).fill(0),
        borderColor: '#0284c7',
        borderWidth: 2,
        tension: 0,
        pointRadius: 2,
        fill: false
      },
      {
        label: 'Node 3 (Field Mesh)',
        data: Array(maxDataPoints).fill(0),
        borderColor: '#059669',
        borderWidth: 2,
        tension: 0,
        pointRadius: 2,
        fill: false
      },
      {
        label: 'FIRE THRESHOLD (2000 ADC)',
        data: Array(maxDataPoints).fill(2000),
        borderColor: '#dc2626',
        borderWidth: 1.5,
        borderDash: [5, 4],
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
        min: 0,
        suggestedMax: 2500
      }
    }
  }
});

function updateSmokeChart() {
  const t = new Date().toLocaleTimeString('en-GB');

  smokeChart.data.labels.shift();
  smokeChart.data.labels.push(t);

  smokeChart.data.datasets[0].data.shift();
  smokeChart.data.datasets[0].data.push(nodes[1].online ? nodes[1].smoke : 0);

  smokeChart.data.datasets[1].data.shift();
  smokeChart.data.datasets[1].data.push(nodes[2].online ? nodes[2].smoke : 0);

  smokeChart.data.datasets[2].data.shift();
  smokeChart.data.datasets[2].data.push(nodes[3].online ? nodes[3].smoke : 0);

  const maxVal = Math.max(nodes[1].smoke, nodes[2].smoke, nodes[3].smoke);
  smokeChart.options.scales.y.suggestedMax = Math.max(2500, Math.ceil(maxVal + 200));
  smokeChart.update();
}

// =========================================================================
// REAL DOM NODE CARDS
// =========================================================================
function updateNodeCard(node) {
  const id = node.id;
  const card = document.getElementById(`card-node-${id}`);
  const badge = document.getElementById(`badge-node-${id}`);
  const smokeEl = document.getElementById(`smoke-${id}`);
  const flameEl = document.getElementById(`flame-${id}`);
  const fireStateEl = document.getElementById(`fire-state-${id}`);
  const lastSeenEl = document.getElementById(`lastseen-${id}`);

  if (!card || !badge) return;

  if (!node.online) {
    badge.className = 'text-[10px] font-mono font-bold px-2 py-0.5 bg-red-100 text-red-800 border border-red-300';
    badge.textContent = 'OFFLINE';
    card.classList.add('opacity-60');

    if (smokeEl) smokeEl.textContent = '0';
    if (flameEl) {
      flameEl.textContent = 'OFFLINE';
      flameEl.className = 'text-base font-bold text-slate-400';
    }
    if (fireStateEl) {
      fireStateEl.textContent = 'DISCONNECTED';
      fireStateEl.className = 'text-xs font-mono font-bold text-slate-400';
    }
    return;
  }

  card.classList.remove('opacity-60');

  // Smoke
  if (smokeEl) smokeEl.textContent = node.smoke;

  // Flame
  if (flameEl) {
    if (node.flame === 1) {
      flameEl.textContent = 'FLAME ACTIVE (1)';
      flameEl.className = 'text-base font-bold text-red-600';
    } else {
      flameEl.textContent = 'CLEAR (0)';
      flameEl.className = 'text-base font-bold text-emerald-700';
    }
  }

  // Fire state
  const isFire = (node.fire === 1 || node.smoke > 2000 || node.flame === 1);
  if (fireStateEl) {
    if (isFire) {
      fireStateEl.textContent = 'FIRE HAZARD DETECTED';
      fireStateEl.className = 'text-xs font-mono font-bold text-red-600 alarm-pulse';
    } else {
      fireStateEl.textContent = 'NORMAL';
      fireStateEl.className = 'text-xs font-mono font-bold text-emerald-700';
    }
  }

  // Status Badge
  if (isFire) {
    badge.className = 'text-[10px] font-mono font-bold px-2 py-0.5 bg-red-600 text-white border border-red-800 alarm-pulse';
    badge.textContent = 'FIRE ALARM';
  } else {
    badge.className = 'text-[10px] font-mono font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300';
    badge.textContent = 'ONLINE';
  }

  // Last seen
  if (lastSeenEl && node.lastSeen) {
    const d = new Date(node.lastSeen);
    lastSeenEl.textContent = `LAST: ${d.toLocaleTimeString('en-GB')}`;
  }
}

// =========================================================================
// TOP KPI SUMMARY (REAL HARDWARE NUMBERS)
// =========================================================================
function updateKpis() {
  const onlineCount = Object.values(nodes).filter(n => n.online).length;
  const activeNodesEl = document.getElementById('stat-active-nodes');
  const activeTagEl = document.getElementById('stat-active-tag');

  if (activeNodesEl) {
    activeNodesEl.textContent = `${onlineCount}/3`;
  }
  if (activeTagEl) {
    if (onlineCount === 0) {
      activeTagEl.textContent = serialConnected ? 'AWAITING UDP NODES' : 'NO HARDWARE';
      activeTagEl.className = 'text-xs font-medium text-slate-500 font-mono';
    } else if (onlineCount === 3) {
      activeTagEl.textContent = 'FULL SWARM ONLINE';
      activeTagEl.className = 'text-xs font-medium text-emerald-700 font-mono';
    } else {
      activeTagEl.textContent = 'PARTIAL MESH';
      activeTagEl.className = 'text-xs font-medium text-amber-700 font-mono';
    }
  }

  // Peak smoke
  let peakSmoke = 0;
  let hasFire = false;
  let fireNodeId = null;

  Object.values(nodes).forEach(n => {
    if (n.online) {
      if (n.smoke > peakSmoke) peakSmoke = n.smoke;
      if (n.fire === 1 || n.smoke > 2000 || n.flame === 1) {
        hasFire = true;
        fireNodeId = n.id;
      }
    }
  });

  const peakSmokeEl = document.getElementById('stat-peak-smoke');
  const smokeTagEl = document.getElementById('stat-smoke-tag');
  if (peakSmokeEl) {
    peakSmokeEl.textContent = peakSmoke;
  }
  if (smokeTagEl) {
    if (peakSmoke > 2000) {
      smokeTagEl.textContent = 'CRITICAL (EXCEEDS 2000)';
      smokeTagEl.className = 'text-xs font-bold text-red-600 font-mono';
    } else {
      smokeTagEl.textContent = 'BELOW 2000 THRESHOLD';
      smokeTagEl.className = 'text-xs font-medium text-slate-500 font-mono';
    }
  }

  // Fire condition
  const condEl = document.getElementById('stat-fire-condition');
  const alarmBanner = document.getElementById('fire-alarm-banner');
  const alarmDetails = document.getElementById('alarm-banner-details');

  if (condEl) {
    if (hasFire) {
      condEl.textContent = 'FIRE DETECTED';
      condEl.className = 'text-2xl font-bold font-mono text-red-600';
    } else {
      condEl.textContent = 'CLEAR';
      condEl.className = 'text-2xl font-bold font-mono text-emerald-700';
    }
  }

  if (hasFire && !alarmAcknowledged) {
    alarmBanner.classList.remove('hidden');
    alarmDetails.textContent = `ALERT: Node ${fireNodeId} reports active fire condition (Smoke: ${nodes[fireNodeId].smoke}, Flame: ${nodes[fireNodeId].flame}).`;
    playAlarmBuzzer();
  } else if (!hasFire) {
    alarmAcknowledged = false;
    alarmBanner.classList.add('hidden');
  }

  // Topology badge
  const topoBadge = document.getElementById('topology-healing-badge');
  if (topoBadge) {
    if (!serialConnected) {
      topoBadge.textContent = 'Awaiting Serial Stream';
      topoBadge.className = 'text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 px-2 py-1 border border-slate-300';
    } else if (onlineCount === 3) {
      topoBadge.textContent = '3 Nodes Active';
      topoBadge.className = 'text-[11px] font-mono font-semibold bg-emerald-100 text-emerald-800 px-2 py-1 border border-emerald-300';
    } else if (onlineCount > 0) {
      topoBadge.textContent = `${onlineCount}/3 Nodes Connected`;
      topoBadge.className = 'text-[11px] font-mono font-semibold bg-amber-100 text-amber-800 px-2 py-1 border border-amber-300';
    } else {
      topoBadge.textContent = 'Serial Open (0 Nodes)';
      topoBadge.className = 'text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 px-2 py-1 border border-slate-300';
    }
  }
}

// =========================================================================
// EVENT LOG
// =========================================================================
function appendLog(log) {
  const tbody = document.getElementById('event-log-tbody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.className = 'border-b border-slate-200';

  let badgeClass = 'bg-slate-100 text-slate-700 border-slate-300';
  if (log.level === 'CRITICAL') badgeClass = 'bg-red-100 text-red-800 border-red-300 font-bold';
  if (log.level === 'WARN') badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';

  const originText = log.nodeId ? `NODE-0${log.nodeId}` : 'SERIAL';

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

document.getElementById('btn-clear-log')?.addEventListener('click', () => {
  const tbody = document.getElementById('event-log-tbody');
  if (tbody) tbody.innerHTML = '';
});

// Append incoming raw serial line
function appendRawSerial(line) {
  const box = document.getElementById('serial-raw-box');
  if (!box) return;

  if (box.children.length === 1 && box.children[0].tagName === 'SPAN') {
    box.innerHTML = '';
  }

  const p = document.createElement('div');
  p.className = 'text-[10px] text-slate-700 truncate';
  p.textContent = line;
  box.appendChild(p);

  while (box.children.length > 20) {
    box.removeChild(box.firstChild);
  }
  box.scrollTop = box.scrollHeight;
}

// =========================================================================
// REAL TOPOLOGY CANVAS
// =========================================================================
const canvas = document.getElementById('topologyCanvas');
const ctx = canvas.getContext('2d');

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

  const posLaptop = { x: 75, y: h / 2, label: 'HOST LAPTOP', sub: 'USB Interface' };
  const posNode1 = { x: w * 0.36, y: h / 2, label: 'NODE 01 (ROOT)', sub: 'AP: EPICS_MESH_ROOT', id: 1 };
  const posNode2 = { x: w * 0.76, y: h * 0.28, label: 'NODE 02', sub: 'UDP Port: 5000', id: 2 };
  const posNode3 = { x: w * 0.76, y: h * 0.72, label: 'NODE 03', sub: 'UDP Port: 5000', id: 3 };

  // 1. USB Wired link: Laptop <-> Root Node 1
  ctx.lineWidth = 2;
  ctx.strokeStyle = serialConnected ? '#0f172a' : '#cbd5e1';
  ctx.setLineDash(serialConnected ? [] : [4, 4]);
  ctx.beginPath();
  ctx.moveTo(posLaptop.x + 48, posLaptop.y);
  ctx.lineTo(posNode1.x - 48, posNode1.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. Wi-Fi UDP Link: Root Node 1 <---> Node 2
  drawLink(posNode1, posNode2, nodes[2].online, nodes[2].online ? 'UDP LINK ACTIVE' : 'NODE 2 OFFLINE');

  // 3. Wi-Fi UDP Link: Root Node 1 <---> Node 3
  drawLink(posNode1, posNode3, nodes[3].online, nodes[3].online ? 'UDP LINK ACTIVE' : 'NODE 3 OFFLINE');

  // Draw Boxes
  drawBox(posLaptop.x, posLaptop.y, 96, 46, '#0f172a', '#ffffff', posLaptop.label, posLaptop.sub);
  drawNode(posNode1.x, posNode1.y, posNode1.label, `Smoke: ${nodes[1].smoke}`, nodes[1].online, nodes[1].fire);
  drawNode(posNode2.x, posNode2.y, posNode2.label, `Smoke: ${nodes[2].smoke}`, nodes[2].online, nodes[2].fire);
  drawNode(posNode3.x, posNode3.y, posNode3.label, `Smoke: ${nodes[3].smoke}`, nodes[3].online, nodes[3].fire);

  requestAnimationFrame(drawTopology);
}

function drawLink(from, to, isOnline, label) {
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = isOnline ? '#059669' : '#ef4444';
  ctx.setLineDash(isOnline ? [] : [4, 4]);

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Midpoint label
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(midX - 44, midY - 8, 88, 16);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(midX - 44, midY - 8, 88, 16);

  ctx.fillStyle = isOnline ? '#059669' : '#ef4444';
  ctx.font = 'bold 8px "JetBrains Mono"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, midX, midY);
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

function drawNode(x, y, title, subtitle, isOnline, fireState) {
  const w = 96;
  const h = 50;
  const isAlarm = fireState === 1;

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

requestAnimationFrame(drawTopology);

// =========================================================================
// SERIAL PORT CONNECTION HANDLERS
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
    select.innerHTML = '<option value="">Scan Failed</option>';
  }
}
refreshSerialPorts();

document.getElementById('btn-refresh-ports')?.addEventListener('click', refreshSerialPorts);

document.getElementById('btn-serial-connect')?.addEventListener('click', async () => {
  const select = document.getElementById('serial-port-select');
  const portPath = select.value;
  const msgEl = document.getElementById('serial-status-msg');

  if (!portPath) {
    msgEl.textContent = 'Please select a valid COM port.';
    msgEl.className = 'text-xs font-mono text-red-600';
    return;
  }

  msgEl.textContent = `Connecting to ${portPath} @ 115200 baud...`;
  msgEl.className = 'text-xs font-mono text-slate-700';

  try {
    const res = await fetch('/api/serial/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: portPath, baudRate: 115200 })
    });
    const json = await res.json();
    if (json.success) {
      msgEl.textContent = `Connected to ${portPath} (115200 baud)`;
      msgEl.className = 'text-xs font-mono text-emerald-700 font-bold';
    } else {
      msgEl.textContent = `Error: ${json.error}`;
      msgEl.className = 'text-xs font-mono text-red-600';
    }
  } catch (err) {
    msgEl.textContent = `Connection error: ${err.message}`;
    msgEl.className = 'text-xs font-mono text-red-600';
  }
});

document.getElementById('btn-serial-disconnect')?.addEventListener('click', async () => {
  const msgEl = document.getElementById('serial-status-msg');
  try {
    await fetch('/api/serial/disconnect', { method: 'POST' });
    msgEl.textContent = 'Disconnected from port.';
    msgEl.className = 'text-xs font-mono text-slate-500';
  } catch (e) {}
});

// =========================================================================
// SOCKET.IO EVENTS
// =========================================================================
socket.on('init:state', data => {
  nodes = data.nodes;
  Object.values(nodes).forEach(n => updateNodeCard(n));
  updateKpis();

  if (data.connectedPort) {
    serialConnected = true;
    document.getElementById('serial-status-dot').className = 'w-2.5 h-2.5 bg-emerald-600 inline-block';
    document.getElementById('serial-mode-label').textContent = `LIVE (${data.connectedPort})`;
  }

  if (data.eventLog) {
    data.eventLog.slice().reverse().forEach(l => appendLog(l));
  }
});

socket.on('telemetry:update', node => {
  nodes[node.id] = node;
  updateNodeCard(node);
  updateKpis();
  updateSmokeChart();
});

socket.on('serial:raw', line => {
  appendRawSerial(line);
});

socket.on('serial:status', status => {
  const dot = document.getElementById('serial-status-dot');
  const label = document.getElementById('serial-mode-label');
  const msgEl = document.getElementById('serial-status-msg');

  if (status.connected) {
    serialConnected = true;
    dot.className = 'w-2.5 h-2.5 bg-emerald-600 inline-block';
    label.textContent = `LIVE (${status.port})`;
    if (msgEl) {
      msgEl.textContent = `Streaming data from ${status.port} @ 115200`;
      msgEl.className = 'text-xs font-mono text-emerald-700 font-bold';
    }
  } else {
    serialConnected = false;
    dot.className = 'w-2.5 h-2.5 bg-red-600 inline-block';
    label.textContent = 'DISCONNECTED';
    if (msgEl) {
      msgEl.textContent = status.error ? `Error: ${status.error}` : 'Disconnected from serial port.';
      msgEl.className = status.error ? 'text-xs font-mono text-red-600' : 'text-xs font-mono text-slate-500';
    }
  }
  updateKpis();
});

socket.on('log:new', log => {
  appendLog(log);
});
