#include <WiFi.h>
#include <WiFiUdp.h>

#define NODE_ID 3
#define MQ2_PIN 34
#define FLAME_PIN 18
#define LED_GREEN 4
#define LED_RED 27

const char* ssid = "EPICS_MESH_ROOT";
const char* password = "epics12345";
const char* rootIP = "192.168.4.1";
const unsigned int rootPort = 5000;

WiFiUDP udp;

void setup() {
  Serial.begin(115200);
  pinMode(FLAME_PIN, INPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  digitalWrite(LED_RED, LOW);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Node 3 connecting to ROOT");

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    digitalWrite(LED_GREEN, !digitalRead(LED_GREEN));
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nFailed to connect. Restarting...");
    ESP.restart();
  }

  digitalWrite(LED_GREEN, HIGH);
  Serial.println("\nConnected to ROOT!");
  Serial.print("My IP: "); Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(LED_GREEN, LOW);
    Serial.println("Connection lost. Restarting...");
    ESP.restart();
  }

  int smoke = analogRead(MQ2_PIN);
  int flame = digitalRead(FLAME_PIN);
  bool fire = (smoke > 2000) || (flame == HIGH);
  digitalWrite(LED_RED, fire ? HIGH : LOW);

  String data = "NODE:" + String(NODE_ID)
              + ",SMOKE:" + String(smoke)
              + ",FLAME:" + String(flame == HIGH ? 1 : 0)
              + ",FIRE:" + String(fire ? 1 : 0)
              + ",STATUS:ONLINE";

  udp.beginPacket(rootIP, rootPort);
  udp.print(data);
  udp.endPacket();

  Serial.println(data);
  delay(2000);
}
