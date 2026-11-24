# EPICS Resilient Sensor Swarm — Web Dashboard

Real-time Node.js dashboard for monitoring a 3-node self-healing ESP-WIFI-MESH fire detection swarm.

---

## Quick Start (Run Without Hardware)

The dashboard includes a built-in **Mesh Telemetry Simulator**. You do **not** need the physical ESP32 boards connected to start testing and rehearsing your review.

1. **Start the server:**
   ```bash
   node server.js
   # or
   npm start
   ```

2. **Open in your browser:**
   ```
   http://localhost:3000
   ```

3. **Try the Reviewer Demo Controls on the dashboard:**
   - **Simulate Fire on Node 2:** Spikes object temp to ~75°C, trips the flame sensor, and triggers the alarm banner + buzzer.
   - **Simulate Smoke Surge on Node 1:** Increases MQ-2 smoke level beyond baseline.
   - **Unplug Node 3 (Test Self-Healing):** Demonstrates watchdog heartbeat failure; Node 3 goes OFFLINE and the topology link highlights the mesh break.
   - **Reset All Nodes:** Returns all 3 nodes to nominal room temperature baselines.

---

## When Connecting the Real ESP32 Root Node

When you are ready to test with physical hardware:

1. Connect the **Root ESP32** to your laptop using a micro-USB / USB-C cable.
2. In the dashboard's **Reviewer Demo Controls** (bottom right of the control panel):
   - Choose your ESP32 COM port from the dropdown (e.g., `COM3`, `COM4`, etc.).
   - Click **Connect**.
3. The dashboard will automatically transition from `SIMULATED MESH` to `LIVE SERIAL` mode.

### Expected Serial JSON Output from Root ESP32

Your Root node firmware simply prints one line of JSON to Serial at `115200` baud whenever a packet arrives from any node in the mesh:

```json
{"nodeId":2,"parent":1,"smoke":140,"flame":0,"tempObj":26.5,"tempAmb":24.2,"humidity":55.0,"rssi":-62,"battery":91}
```

#### Example Arduino / ESP-IDF Serial Output Snippet
```cpp
void sendToDashboard(int nodeId, int parent, float smoke, int flame, float tempObj, float tempAmb, float humidity, int rssi, int battery) {
  Serial.printf("{\"nodeId\":%d,\"parent\":%d,\"smoke\":%.1f,\"flame\":%d,\"tempObj\":%.1f,\"tempAmb\":%.1f,\"humidity\":%.1f,\"rssi\":%d,\"battery\":%d}\n",
    nodeId, parent, smoke, flame, tempObj, tempAmb, humidity, rssi, battery);
}
```

---

## UI Specification Adherence

- **Theme:** Clean, bright light palette (`#ffffff` and `#f1f5f9`), high contrast.
- **Edges:** Strictly straight edges (`border-radius: 0 !important;`) on all panels, buttons, badges, and canvas nodes.
- **Gradients:** Zero gradients; solid flat industrial colors.
- **Icons:** SVG vector icons for all indicators and controls; zero emojis.
