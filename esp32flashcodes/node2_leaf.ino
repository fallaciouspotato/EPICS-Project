#include <WiFi.h>
#include <WiFiUdp.h>

// ============================================================================
// EPICS RESILIENT SENSOR SWARM - NODE 2 (DUAL AP+STA MESH RELAY)
// Self-Healing WiFi Mesh: Sensor Node & Dynamic Multi-Hop Relay
// ============================================================================

#define NODE_ID 2
#define MQ2_PIN 34
#define FLAME_PIN 18
#define LED_GREEN 4
#define LED_RED 27

// Upstream Root Connection (STA)
const char* rootSSID = "EPICS_MESH_ROOT";
const char* rootPassword = "epics12345";
const char* rootIP = "192.168.4.1";
const unsigned int rootPort = 5000;

// Local Relay Access Point for Child Failover (AP)
const char* relaySSID = "EPICS_RELAY_2";
const char* relayPassword = "epics12345";
const IPAddress localRelayIP(192, 168, 5, 1);
const IPAddress localGateway(192, 168, 5, 1);
const IPAddress localSubnet(255, 255, 255, 0);

WiFiUDP udp;
char relayBuffer[256];

unsigned long lastTelemetry = 0;
unsigned long lastReconnectAttempt = 0;
const unsigned long TELEMETRY_INTERVAL = 2000;
const unsigned long RECONNECT_INTERVAL = 4000;

void setup() {
  Serial.begin(115200);
  pinMode(MQ2_PIN, INPUT);
  pinMode(FLAME_PIN, INPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED, LOW);

  // Enable simultaneous Station and Access Point modes
  WiFi.mode(WIFI_AP_STA);

  // Configure and start Relay SoftAP on separate subnet to prevent collisions
  WiFi.softAPConfig(localRelayIP, localGateway, localSubnet);
  WiFi.softAP(relaySSID, relayPassword);

  // Start listening on UDP port 5000 for incoming multi-hop packets
  udp.begin(rootPort);

  // Connect to Root AP
  WiFi.begin(rootSSID, rootPassword);

  Serial.println("==================================================");
  Serial.println("  EPICS SELF-HEALING SWARM: NODE 2 (AP+STA RELAY)");
  Serial.println("  Upstream Target: EPICS_MESH_ROOT");
  Serial.print("  Relay AP SSID:   "); Serial.println(relaySSID);
  Serial.print("  Relay IP:        "); Serial.println(WiFi.softAPIP());
  Serial.println("==================================================");
}

void loop() {
  unsigned long now = millis();

  // 1. Non-blocking Wi-Fi Reconnect (Self-healing without reboot loop)
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(LED_GREEN, (now / 500) % 2 == 0 ? HIGH : LOW); // Blink while disconnected
    if (now - lastReconnectAttempt >= RECONNECT_INTERVAL) {
      lastReconnectAttempt = now;
      Serial.println("[WIFI] Reconnecting STA to Root AP...");
      WiFi.disconnect();
      WiFi.begin(rootSSID, rootPassword);
    }
  } else {
    digitalWrite(LED_GREEN, HIGH); // Solid green when connected to Root
  }

  // 2. Multi-hop Packet Forwarding (Relay child packets from Node 3 to Node 1)
  while (udp.parsePacket() > 0) {
    int len = udp.read(relayBuffer, sizeof(relayBuffer) - 1);
    if (len > 0) {
      relayBuffer[len] = '\0';
      String childPacket = String(relayBuffer);
      childPacket.trim();

      // If packet is from a child node (e.g. Node 3), forward to Root Gateway
      if (childPacket.indexOf("NODE:3") >= 0) {
        Serial.print("[SELF-HEALING RELAY] Forwarding Node 3 packet to Root: ");
        Serial.println(childPacket);

        if (WiFi.status() == WL_CONNECTED) {
          udp.beginPacket(rootIP, rootPort);
          udp.print(childPacket);
          udp.endPacket();
        }
      }
    }
  }

  // 3. Sensor Reading & Self Telemetry Transmission
  if (now - lastTelemetry >= TELEMETRY_INTERVAL) {
    lastTelemetry = now;

    int smoke = analogRead(MQ2_PIN);
    int flame = digitalRead(FLAME_PIN);
    bool fire = (smoke > 2000) || (flame == HIGH);
    digitalWrite(LED_RED, fire ? HIGH : LOW);

    bool isOnline = (WiFi.status() == WL_CONNECTED);
    int rssi = isOnline ? WiFi.RSSI() : 0;

    String telemetry = "NODE:" + String(NODE_ID)
                     + ",PARENT:1,HOPS:1"
                     + ",SMOKE:" + String(smoke)
                     + ",FLAME:" + String(flame == HIGH ? 1 : 0)
                     + ",FIRE:" + String(fire ? 1 : 0)
                     + ",RSSI:" + String(rssi)
                     + ",STATUS:" + (isOnline ? "ONLINE" : "OFFLINE");

    if (isOnline) {
      udp.beginPacket(rootIP, rootPort);
      udp.print(telemetry);
      udp.endPacket();
    }

    Serial.println(telemetry);
  }
}
