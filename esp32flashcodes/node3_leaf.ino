#include <WiFi.h>
#include <WiFiUdp.h>

// ============================================================================
// EPICS RESILIENT SENSOR SWARM - NODE 3 (AUTONOMOUS FAILOVER & HEALING)
// Self-Healing WiFi Mesh: Automatic Parent Failover & Dynamic Re-routing
// ============================================================================

#define NODE_ID 3
#define MQ2_PIN 34
#define FLAME_PIN 18
#define LED_GREEN 4
#define LED_RED 27

// Primary Route: Direct to Root Gateway (Node 1)
const char* primarySSID = "EPICS_MESH_ROOT";
const char* primaryPassword = "epics12345";
const char* primaryIP = "192.168.4.1";

// Failover Route: Relayed via Node 2
const char* failoverSSID = "EPICS_RELAY_2";
const char* failoverPassword = "epics12345";
const char* failoverIP = "192.168.5.1";

const unsigned int targetPort = 5000;

// Dynamic Route State
enum RouteTarget { ROUTE_PRIMARY_NODE1, ROUTE_FAILOVER_NODE2 };
RouteTarget currentRoute = ROUTE_PRIMARY_NODE1;
int currentParent = 1;
int currentHops = 1;
const char* currentTargetIP = primaryIP;

WiFiUDP udp;

unsigned long lastTelemetry = 0;
unsigned long lastLinkCheck = 0;
unsigned long routeFailTime = 0;
int connectionFailures = 0;

const unsigned long TELEMETRY_INTERVAL = 2000;
const int MAX_FAILURES_BEFORE_FAILOVER = 3;
const unsigned long FAILBACK_PROBE_INTERVAL = 30000; // Check if primary is back every 30s

void connectToRoute(RouteTarget target) {
  currentRoute = target;
  WiFi.disconnect();
  delay(100);

  if (target == ROUTE_PRIMARY_NODE1) {
    currentParent = 1;
    currentHops = 1;
    currentTargetIP = primaryIP;
    Serial.println("\n[ROUTE ENGINE] Connecting to PRIMARY: Node 1 (EPICS_MESH_ROOT)...");
    WiFi.begin(primarySSID, primaryPassword);
  } else {
    currentParent = 2;
    currentHops = 2;
    currentTargetIP = failoverIP;
    Serial.println("\n[SELF-HEALING FAILOVER] Switching to RELAY: Node 2 (EPICS_RELAY_2)...");
    WiFi.begin(failoverSSID, failoverPassword);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(MQ2_PIN, INPUT);
  pinMode(FLAME_PIN, INPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED, LOW);

  WiFi.mode(WIFI_STA);

  Serial.println("==================================================");
  Serial.println("  EPICS SELF-HEALING SWARM: NODE 3 (LEAF NODE)");
  Serial.println("  Autonomous Failover: Node 1 (Direct) <-> Node 2 (Relay)");
  Serial.println("==================================================");

  connectToRoute(ROUTE_PRIMARY_NODE1);
}

void loop() {
  unsigned long now = millis();

  // 1. Connection Health & Failover State Machine
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(LED_GREEN, (now / 300) % 2 == 0 ? HIGH : LOW); // Rapid blink on disconnect

    if (now - lastLinkCheck >= 2000) {
      lastLinkCheck = now;
      connectionFailures++;
      Serial.print("[LINK CHECK] Connection attempt ");
      Serial.print(connectionFailures);
      Serial.print("/");
      Serial.println(MAX_FAILURES_BEFORE_FAILOVER);

      if (connectionFailures >= MAX_FAILURES_BEFORE_FAILOVER) {
        connectionFailures = 0;
        // Trigger Self-Healing: Toggle route
        if (currentRoute == ROUTE_PRIMARY_NODE1) {
          Serial.println("[ALERT] Primary Node 1 unreachable! Triggering Self-Healing failover to Node 2...");
          connectToRoute(ROUTE_FAILOVER_NODE2);
        } else {
          Serial.println("[ALERT] Relay Node 2 unreachable! Retrying Primary Node 1...");
          connectToRoute(ROUTE_PRIMARY_NODE1);
        }
      }
    }
  } else {
    connectionFailures = 0;
    digitalWrite(LED_GREEN, HIGH);

    // If currently on failover route, periodically probe if primary Root AP is back online
    if (currentRoute == ROUTE_FAILOVER_NODE2 && (now - routeFailTime >= FAILBACK_PROBE_INTERVAL)) {
      routeFailTime = now;
      Serial.println("[ROUTE HEALING] Probing if Primary Node 1 is back online...");
      connectToRoute(ROUTE_PRIMARY_NODE1);
    }
  }

  // 2. Sensor Sampling and Telemetry Transmission
  if (now - lastTelemetry >= TELEMETRY_INTERVAL) {
    lastTelemetry = now;

    int smoke = analogRead(MQ2_PIN);
    int flame = digitalRead(FLAME_PIN);
    bool fire = (smoke > 2000) || (flame == HIGH);
    digitalWrite(LED_RED, fire ? HIGH : LOW);

    bool isOnline = (WiFi.status() == WL_CONNECTED);
    int rssi = isOnline ? WiFi.RSSI() : 0;

    String telemetry = "NODE:" + String(NODE_ID)
                     + ",PARENT:" + String(currentParent)
                     + ",HOPS:" + String(currentHops)
                     + ",SMOKE:" + String(smoke)
                     + ",FLAME:" + String(flame == HIGH ? 1 : 0)
                     + ",FIRE:" + String(fire ? 1 : 0)
                     + ",RSSI:" + String(rssi)
                     + ",STATUS:" + (isOnline ? "ONLINE" : "OFFLINE");

    if (isOnline) {
      udp.beginPacket(currentTargetIP, targetPort);
      udp.print(telemetry);
      udp.endPacket();
    }

    Serial.println(telemetry);
  }
}
