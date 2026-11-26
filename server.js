const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

// SerialPort loader
let SerialPort, ReadlineParser;
try {
  const serialModule = require('serialport');
  SerialPort = serialModule.SerialPort;
  ReadlineParser = require('@serialport/parser-readline').ReadlineParser;
} catch (err) {
  console.log('[SerialPort] Warning:', err.message);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Real node states — initial state is OFFLINE with 0 values until real hardware streams
const nodes = {
  1: { id: 1, name: 'Node 1 (Root Gateway)', role: 'Root / Sensor Gateway', online: false, smoke: 0, flame: 0, fire: 0, lastSeen: null },
  2: { id: 2, name: 'Node 2 (Field Mesh)', role: 'Mesh Sensor Node', online: false, smoke: 0, flame: 0, fire: 0, lastSeen: null },
  3: { id: 3, name: 'Node 3 (Field Mesh)', role: 'Mesh Sensor Node', online: false, smoke: 0, flame: 0, fire: 0, lastSeen: null }
};

// Event log
const eventLog = [];
function addLog(level, message, nodeId = null) {
  const item = {
    id: Date.now() + Math.random(),
    time: new Date().toLocaleTimeString('en-GB'),
    level, // 'INFO', 'WARN', 'CRITICAL'
    message,
    nodeId
  };
  eventLog.unshift(item);
  if (eventLog.length > 50) eventLog.pop();
  io.emit('log:new', item);
}

// Parse exact ESP32 key-value line: NODE:1,SMOKE:450,FLAME:0,FIRE:0,STATUS:ONLINE
function parseSerialPacket(rawLine) {
  const line = rawLine.trim();
  if (!line || line === '---' || line.startsWith('==') || line.startsWith('WiFi') || line.startsWith('ROOT') || line.startsWith('EPICS')) {
    return null;
  }

  if (line.includes('NODE:')) {
    const parts = line.split(',');
    const packet = {
      nodeId: null,
      smoke: 0,
      flame: 0,
      fire: 0,
      status: 'OFFLINE'
    };

    for (const part of parts) {
      const idx = part.indexOf(':');
      if (idx === -1) continue;
      const key = part.substring(0, idx).trim().toUpperCase();
      const val = part.substring(idx + 1).trim();

      if (key === 'NODE') packet.nodeId = parseInt(val, 10);
      else if (key === 'SMOKE') packet.smoke = parseInt(val, 10);
      else if (key === 'FLAME') packet.flame = parseInt(val, 10);
      else if (key === 'FIRE') packet.fire = parseInt(val, 10);
      else if (key === 'STATUS') packet.status = val.toUpperCase();
    }

    if (packet.nodeId && nodes[packet.nodeId]) {
      return packet;
    }
  }

  return null;
}

// Ingest real hardware packet
function handlePacket(pkt) {
  const id = pkt.nodeId;
  const node = nodes[id];
  if (!node) return;

  const wasOnline = node.online;
  const isOnline = pkt.status === 'ONLINE';

  node.online = isOnline;
  node.smoke = Number(pkt.smoke || 0);
  node.flame = Number(pkt.flame || 0);
  node.fire = Number(pkt.fire || 0);
  node.lastSeen = isOnline ? Date.now() : node.lastSeen;

  if (isOnline && !wasOnline) {
    addLog('INFO', `Node ${id} is ONLINE and transmitting`, id);
  } else if (!isOnline && wasOnline) {
    addLog('WARN', `Node ${id} reported OFFLINE by Root gateway`, id);
  }

  if (node.fire === 1) {
    addLog('CRITICAL', `FIRE DETECTED on Node ${id}! Smoke: ${node.smoke}, Flame: ${node.flame === 1 ? 'TRIGGERED' : 'CLEAR'}`, id);
  }

  io.emit('telemetry:update', node);
}

// Serial Port Connection Manager
let activeSerial = null;
let activeParser = null;
let currentPort = null;

function connectSerialPort(comPath, baudRate = 115200) {
  if (!SerialPort) return { success: false, error: 'SerialPort library not available' };

  if (activeSerial && activeSerial.isOpen) {
    try { activeSerial.close(); } catch (e) {}
  }

  try {
    activeSerial = new SerialPort({ path: comPath, baudRate: parseInt(baudRate, 10) });
    activeParser = activeSerial.pipe(new ReadlineParser({ delimiter: '\n' }));
    currentPort = comPath;

    activeSerial.on('open', () => {
      console.log(`[SerialPort] Connected to ${comPath} at ${baudRate} baud`);
      addLog('INFO', `Connected to Root ESP32 on port ${comPath}`);
      io.emit('serial:status', { connected: true, port: comPath });
    });

    activeParser.on('data', rawLine => {
      const line = rawLine.trim();
      if (!line) return;

      // Broadcast raw incoming serial feed so user can visually verify packets arriving
      io.emit('serial:raw', line);

      const packet = parseSerialPacket(line);
      if (packet) {
        handlePacket(packet);
      }
    });

    activeSerial.on('error', err => {
      console.error('[SerialPort Error]:', err.message);
      addLog('WARN', `Serial Port Error: ${err.message}`);
      io.emit('serial:status', { connected: false, error: err.message });
    });

    activeSerial.on('close', () => {
      console.log('[SerialPort] Connection closed.');
      addLog('WARN', 'Serial connection to Root Node closed.');
      currentPort = null;
      io.emit('serial:status', { connected: false });
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// REST API
app.get('/api/state', (req, res) => {
  res.json({
    nodes,
    connectedPort: currentPort,
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

app.post('/api/serial/disconnect', (req, res) => {
  if (activeSerial && activeSerial.isOpen) {
    activeSerial.close();
  }
  res.json({ success: true });
});

// Socket.io connection
io.on('connection', socket => {
  socket.emit('init:state', {
    nodes,
    connectedPort: currentPort,
    eventLog: eventLog.slice(0, 30)
  });
});

// Graceful Port Handling
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use by another process.`);
    console.error(`To kill it, run in PowerShell:`);
    console.error(`  Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

process.on('SIGINT', () => {
  if (activeSerial && activeSerial.isOpen) {
    try { activeSerial.close(); } catch (e) {}
  }
  server.close(() => {
    process.exit(0);
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  EPICS RESILIENT SENSOR SWARM DASHBOARD (HARDWARE ONLY)`);
  console.log(`  Dashboard running at: http://localhost:${PORT}`);
  console.log(`  Simulation: DISABLED (Waiting for real ESP32 serial data)`);
  console.log(`  Press Ctrl+C to stop the server`);
  console.log(`=======================================================`);
  addLog('INFO', 'Dashboard server ready for ESP32 Root connection');
});
