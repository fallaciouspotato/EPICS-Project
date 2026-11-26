#include <WiFi.h>
#include <WiFiUdp.h>

// ============================================================================
// EPICS RESILIENT SENSOR SWARM - NODE 1 (ROOT GATEWAY)
// Self-Healing WiFi Mesh: Root Gateway & Route Collector
// ============================================================================

#define MQ2_PIN 34
#define FLAME_PIN 18
#define LED_GREEN 4
#define LED_RED 27

const char* ssid = "EPICS_MESH_ROOT";
const char* password = "epics12345";
const unsigned int localPort = 5000;
const unsigned long TIMEOUT = 8000;
const unsigned long REPORT_INTERVAL = 2000;

WiFiUDP udp;
char packetBuffer[256];

// Node tracking states
String node2Data = "NODE:2,PARENT:1,HOPS:1,SMOKE:0,FLAME:0,FIRE:0,RSSI:0,STATUS:OFFLINE";
String node3Data = "NODE:3,PARENT:1,HOPS:1,SMOKE:0,FLAME:0,FIRE:0,RSSI:0,STATUS:OFFLINE";
unsigned long lastNode2 = 0;
unsigned long lastNode3 = 0;
unsigned long lastReport = 0;

void setup() {
  Serial.begin(115200);
  pinMode(MQ2_PIN, INPUT);
  pinMode(FLAME_PIN, INPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  digitalWrite(LED_GREEN, HIGH);
  digitalWrite(LED_RED, LOW);

  // Set SoftAP configuration for Root Node
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssid, password);
  udp.begin(localPort);

  Serial.println("==================================================");
  Serial.println("  EPICS SELF-HEALING SWARM: ROOT GATEWAY (NODE 1)");
  Serial.println("  Mesh Root AP: EPICS_MESH_ROOT");
  Serial.print("  Root IP:      "); Serial.println(WiFi.softAPIP());
  Serial.print("  UDP Port:     "); Serial.println(localPort);
  Serial.println("  Route Engine: Multi-hop Relay & Failover Active");
  Serial.println("==================================================");
}

void loop() {
  // Ingest incoming UDP packets from direct nodes or relayed multi-hop packets
  while (udp.parsePacket() > 0) {
    int len = udp.read(packetBuffer, sizeof(packetBuffer) - 1);
    if (len > 0) {
      packetBuffer[len] = '\0';
      String data = String(packetBuffer);
      data.trim();

      if (data.indexOf("NODE:2") >= 0) {
        node2Data = data;
        lastNode2 = millis();
      } else if (data.indexOf("NODE:3") >= 0) {
        node3Data = data;
        lastNode3 = millis();
      }
    }
  }

  unsigned long now = millis();
  if (now - lastReport >= REPORT_INTERVAL) {
    lastReport = now;

    int smoke = analogRead(MQ2_PIN);
    int flame = digitalRead(FLAME_PIN);
    bool fire = (smoke > 2000) || (flame == HIGH);
    digitalWrite(LED_RED, fire ? HIGH : LOW);

    // Watchdog check for Node 2
    if (now - lastNode2 > TIMEOUT) {
      node2Data = "NODE:2,PARENT:1,HOPS:1,SMOKE:0,FLAME:0,FIRE:0,RSSI:0,STATUS:OFFLINE";
    }
    // Watchdog check for Node 3
    if (now - lastNode3 > TIMEOUT) {
      node3Data = "NODE:3,PARENT:1,HOPS:1,SMOKE:0,FLAME:0,FIRE:0,RSSI:0,STATUS:OFFLINE";
    }

    // Output telemetry to Dashboard Serial:
    // Format: NODE:x,PARENT:y,HOPS:z,SMOKE:s,FLAME:f,FIRE:a,RSSI:r,STATUS:ONLINE/OFFLINE
    Serial.print("NODE:1,PARENT:0,HOPS:0,SMOKE:"); Serial.print(smoke);
    Serial.print(",FLAME:"); Serial.print(flame == HIGH ? 1 : 0);
    Serial.print(",FIRE:"); Serial.print(fire ? 1 : 0);
    Serial.println(",RSSI:0,STATUS:ONLINE");

    Serial.println(node2Data);
    Serial.println(node3Data);
    Serial.println("---");
  }
}
