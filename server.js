const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

// Try loading serialport gracefully so app never crashes if no device is connected
let SerialPort, ReadlineParser;
try {
  const serialModule = require('serialport');
  SerialPort = serialModule.SerialPort;
  ReadlineParser = require('@serialport/parser-readline').ReadlineParser;
} catch (err) {
  console.log('[SerialPort] Optional serial module not available or native build missing:', err.message);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory node states (Nodes 1, 2, 3)
const nodes = {
  1: {
    id: 1,
    name: 'Node 1 (Root Gateway)',
    role: 'Root / Sensor Node',
    parent: 0,
    online: true,
    lastSeen: Date.now(),
    smoke: 125,
    flame: 0,
    tempObj: 26.2,
    tempAmb: 24.5,
    humidity: 56.0,
    rssi: -45,
    battery: 98,
    trustScore: 1.0,
    fireRisk: 2
  },
  2: {
    id: 2,
    name: 'Node 2 (Field Mesh)',
    role: 'Sensor Node',
    parent: 1,
    online: true,
    lastSeen: Date.now(),
    smoke: 132,
    flame: 0,
    tempObj: 26.8,
    tempAmb: 24.6,
    humidity: 55.4,
    rssi: -62,
    battery: 91,
    trustScore: 1.0,
    fireRisk: 3
  },
  3: {
    id: 3,
    name: 'Node 3 (Boundary Node)',
    role: 'Sensor Node',
    parent: 2,
    online: true,
    lastSeen: Date.now(),
    smoke: 118,
    flame: 0,
    tempObj: 25.9,
    tempAmb: 24.3,
    humidity: 57.1,
    rssi: -71,
    battery: 87,
    trustScore: 1.0,
    fireRisk: 1
  }
};

// Simulation overrides (for demo review rehearsal)
const simOverrides = {
  active: true,
  node2Fire: false,
  node1Smoke: false,
  node2Offline: false,
  node3Offline: false
};

// Event log
const eventLog = [];
function addLog(level, message, nodeId = null) {
  const item = {
    id: Date.now() + Math.random(),
    time: new Date().toLocaleTimeString(),
    level, // 'INFO', 'WARN', 'CRITICAL', 'RECOVERY'
    message,
    nodeId
  };
  eventLog.unshift(item);
  if (eventLog.length > 100) eventLog.pop();
  io.emit('log:new', item);
}

// Compute multi-sensor Fire Risk Score (0 - 100)
function calculateFireRisk(node) {
  let risk = 0;

  // Temperature factor (MLX90614 object temp)
  if (node.tempObj > 70) risk += 50;
  else if (node.tempObj > 50) risk += 35;
  else if (node.tempObj > 38) risk += 15;

  // Smoke factor (MQ-2 analog)
  if (node.smoke > 500) risk += 30;
  else if (node.smoke > 300) risk += 20;
  else if (node.smoke > 200) risk += 10;

  // Flame sensor (KY-026 active low or digital flag = 1)
  if (node.flame === 1) risk += 40;

  // Ambient difference: object temp much higher than ambient
  if (node.tempObj - node.tempAmb > 15) risk += 15;

  return Math.min(100, Math.max(0, Math.round(risk)));
}

// Process an incoming telemetry packet from either Serial or Simulator
function handlePacket(data) {
  const id = parseInt(data.nodeId || data.id, 10);
  if (!id || !nodes[id]) return;

  const node = nodes[id];
  node.online = true;
  node.lastSeen = Date.now();
  if (data.parent !== undefined) node.parent = parseInt(data.parent, 10);
  if (data.smoke !== undefined) node.smoke = Number(data.smoke);
  if (data.flame !== undefined) node.flame = Number(data.flame);
  if (data.tempObj !== undefined) node.tempObj = Number(data.tempObj);
  if (data.tempAmb !== undefined) node.tempAmb = Number(data.tempAmb);
  if (data.humidity !== undefined) node.humidity = Number(data.humidity);
  if (data.rssi !== undefined) node.rssi = Number(data.rssi);
  if (data.battery !== undefined) node.battery = Number(data.battery);

  const prevRisk = node.fireRisk;
  node.fireRisk = calculateFireRisk(node);

  // Trigger alert if severe
  if (node.fireRisk >= 60 && prevRisk < 60) {
    addLog('CRITICAL', `High Fire Risk (${node.fireRisk}%) detected on Node ${id}! Object Temp: ${node.tempObj.toFixed(1)}°C, Smoke: ${node.smoke}`, id);
  }

  io.emit('telemetry:update', node);
}

// Watchdog for Node Health (Flags node OFFLINE if inactive > 7 seconds)
setInterval(() => {
  const now = Date.now();
  Object.values(nodes).forEach(node => {
    if (node.online && now - node.lastSeen > 7000) {
      node.online = false;
      addLog('WARN', `Heartbeat lost: Node ${node.id} is OFFLINE. Mesh rerouting.`, node.id);
      io.emit('node:status', { id: node.id, online: false });
    }
  });
}, 2000);

// Simulator Loop (Streams realistic data every 1.5 seconds)
setInterval(() => {
  if (!simOverrides.active) return;

  [1, 2, 3].forEach(id => {
    // If node is simulated offline, stop broadcasting it
    if (id === 2 && simOverrides.node2Offline) return;
    if (id === 3 && simOverrides.node3Offline) return;

    const current = nodes[id];
    let smokeBase = 120 + Math.sin(Date.now() / 4000) * 15;
    let tempBase = 26.0 + Math.cos(Date.now() / 5000) * 1.2;
    let flameVal = 0;

    // Apply demo simulation triggers
    if (id === 2 && simOverrides.node2Fire) {
      tempBase = 74.5 + Math.random() * 4;
      smokeBase = 460 + Math.random() * 60;
      flameVal = 1;
    }

    if (id === 1 && simOverrides.node1Smoke) {
      smokeBase = 380 + Math.random() * 30;
      tempBase = 32.0 + Math.random() * 2;
    }

    // Dynamic routing:
    // If Node 2 is online, Node 3 routes via Node 2 (multi-hop).
    // If Node 2 is offline, Node 3 automatically self-heals and connects directly to Root (Node 1)!
    let parent = 0;
    if (id === 2) {
      parent = 1;
    } else if (id === 3) {
      parent = nodes[2].online ? 2 : 1;
    }

    handlePacket({
      nodeId: id,
      parent: parent,
      smoke: Math.round(smokeBase + (Math.random() * 4 - 2)),
      flame: flameVal,
      tempObj: Number((tempBase + (Math.random() * 0.4 - 0.2)).toFixed(1)),
      tempAmb: Number((24.2 + (Math.random() * 0.2)).toFixed(1)),
      humidity: Number((55.0 + (Math.random() * 0.8)).toFixed(1)),
      rssi: -50 - (id * 10) + Math.round(Math.random() * 4 - 2),
      battery: Math.max(70, current.battery)
    });
  });
}, 1500);

// Real Hardware Serial Port Handler
let activeSerial = null;
let activeParser = null;

function connectSerialPort(comPath, baudRate = 115200) {
  if (!SerialPort) return { success: false, error: 'SerialPort library not installed' };

  if (activeSerial && activeSerial.isOpen) {
    activeSerial.close();
  }

  try {
    activeSerial = new SerialPort({ path: comPath, baudRate: parseInt(baudRate, 10) });
    activeParser = activeSerial.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    activeSerial.on('open', () => {
      console.log(`[SerialPort] Connected to ${comPath} at ${baudRate} baud`);
      addLog('INFO', `Connected to Root ESP32 on port ${comPath}`);
      simOverrides.active = false; // Disable mock when hardware streams
      io.emit('serial:status', { connected: true, port: comPath });
    });

    activeParser.on('data', line => {
      line = line.trim();
      if (!line) return;
      try {
        const json = JSON.parse(line);
        handlePacket(json);
      } catch (err) {
        // Raw serial line debug
        console.log('[Serial Raw]:', line);
      }
    });

    activeSerial.on('error', err => {
      console.error('[SerialPort Error]:', err.message);
      addLog('WARN', `Serial Port Error: ${err.message}`);
      io.emit('serial:status', { connected: false, error: err.message });
    });

    activeSerial.on('close', () => {
      console.log('[SerialPort] Connection closed.');
      addLog('WARN', 'Serial connection to Root Node closed. Resuming simulation.');
      simOverrides.active = true;
      io.emit('serial:status', { connected: false });
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// API Routes
app.get('/api/state', (req, res) => {
  res.json({
    nodes,
    simOverrides,
    eventLog: eventLog.slice(0, 30)
  });
});

app.get('/api/serial/ports', async (req, res) => {
  if (!SerialPort) return res.json({ ports: [] });
  try {
    const ports = await SerialPort.list();
    res.json({ ports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/serial/connect', (req, res) => {
  const { path: comPath, baudRate } = req.body;
  const result = connectSerialPort(comPath, baudRate || 115200);
  res.json(result);
});

app.post('/api/sim/control', (req, res) => {
  const { action, value } = req.body;
  if (action === 'toggleSim') simOverrides.active = !!value;
  if (action === 'node2Fire') simOverrides.node2Fire = !!value;
  if (action === 'node1Smoke') simOverrides.node1Smoke = !!value;
  if (action === 'node2Offline') {
    simOverrides.node2Offline = !!value;
    if (value) {
      nodes[2].online = false;
      addLog('WARN', 'Node 2 disconnected (Mid-Mesh Failure). Mesh self-healing activated.', 2);
      io.emit('node:status', { id: 2, online: false });
    } else {
      nodes[2].lastSeen = Date.now();
      nodes[2].online = true;
      addLog('RECOVERY', 'Node 2 reconnected to swarm.', 2);
      io.emit('node:status', { id: 2, online: true });
    }
  }
  if (action === 'node3Offline') {
    simOverrides.node3Offline = !!value;
    if (value) {
      nodes[3].online = false;
      addLog('WARN', 'Node 3 disconnected.', 3);
      io.emit('node:status', { id: 3, online: false });
    } else {
      nodes[3].lastSeen = Date.now();
      nodes[3].online = true;
      addLog('RECOVERY', 'Node 3 reconnected to swarm.', 3);
      io.emit('node:status', { id: 3, online: true });
    }
  }
  if (action === 'resetAll') {
    simOverrides.node2Fire = false;
    simOverrides.node1Smoke = false;
    simOverrides.node2Offline = false;
    simOverrides.node3Offline = false;
    nodes[1].online = true;
    nodes[2].online = true;
    nodes[3].online = true;
    nodes[1].lastSeen = Date.now();
    nodes[2].lastSeen = Date.now();
    nodes[3].lastSeen = Date.now();
    nodes[3].parent = 2;
    addLog('INFO', 'All nodes reset to nominal state. Primary mesh routing restored.');
  }

  io.emit('sim:state', simOverrides);
  res.json({ success: true, simOverrides });
});

// Socket connection
io.on('connection', socket => {
  socket.emit('init:state', {
    nodes,
    simOverrides,
    eventLog: eventLog.slice(0, 30)
  });

  socket.on('manual:packet', packet => {
    handlePacket(packet);
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use by another background process.`);
    console.error(`To kill it, run in PowerShell:`);
    console.error(`  Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

process.on('SIGINT', () => {
  console.log('\n[Shutdown] Stopping server and releasing port 3000...');
  server.close(() => {
    console.log('[Shutdown] Server closed.');
    process.exit(0);
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  EPICS RESILIENT SENSOR SWARM DASHBOARD`);
  console.log(`  Dashboard running at: http://localhost:${PORT}`);
  console.log(`  Simulation Mode: Active (Broadcasting 3 Mesh Nodes)`);
  console.log(`  Press Ctrl+C to stop the server`);
  console.log(`=======================================================`);
  addLog('INFO', 'EPICS Swarm Gateway & Dashboard service initialized');
});
