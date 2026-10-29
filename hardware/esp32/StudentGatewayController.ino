#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>
#include <LiquidCrystal_I2C.h>

// ================= WiFi =================
const char* ssid     = "gate";
const char* password = "9600873401";

// ================= Pins =================
#define SERVO_PIN         13
#define LCD_SDA           21
#define LCD_SCL           22

// ================= Gate settings =================
#define GATE_OPEN_ANGLE   90
#define GATE_CLOSE_ANGLE  0
#define GATE_OPEN_MS      10000UL   // 60 seconds

// Laptop gate_monitor / config.py-la irukka key-oda SAME-ah irukkanum
const char* GATE_KEY = "studentgatewaydemoGateToken987654321";

Servo gate;
LiquidCrystal_I2C lcd(0x27, 16, 2);   // blank-ah irundha 0x3F try pannunga
WebServer server(80);
bool gateBusy = false;

// ================= LCD helper =================
void showLCD(String l1, String l2 = "") {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(l1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(l2.substring(0, 16));
}

// ================= Gate helper =================
void openGate(unsigned long ms, String who) {
  gateBusy = true;
  showLCD("ACCESS GRANTED", who.substring(0, 16));
  gate.write(GATE_OPEN_ANGLE);
  delay(ms);
  gate.write(GATE_CLOSE_ANGLE);
  showLCD("Gate Ready", WiFi.localIP().toString());
  gateBusy = false;
}

// ================= HTTP handlers =================
void handleHealth() {
  String msg = "ESP32 Gate running\n";
  msg += "Gate busy: ";
  msg += gateBusy ? "yes\n" : "no\n";
  msg += "IP: " + WiFi.localIP().toString() + "\n";
  server.send(200, "text/plain", msg);
}

// Laptop calls: /gate/open?who=732925ECR001&key=...
void handleGateOpen() {
  String key = server.hasArg("key") ? server.arg("key") : "";
  String who = server.hasArg("who") ? server.arg("who") : "unknown";

  if (key != GATE_KEY) {
    Serial.println("[gate] UNAUTHORIZED");
    server.send(401, "text/plain", "unauthorized");
    return;
  }
  if (gateBusy) {
    server.send(409, "text/plain", "gate busy");
    return;
  }

  Serial.println("[gate] OPEN for " + who);
  server.send(200, "text/plain", "OPEN " + who);  // reply first
  openGate(GATE_OPEN_MS, who);
}

// Testing only: browser-la /gate/test (5 sec)
void handleGateTest() {
  if (gateBusy) {
    server.send(409, "text/plain", "gate busy");
    return;
  }
  server.send(200, "text/plain", "Gate test done");
  openGate(5000, "TEST");
}

void handleNotFound() {
  server.send(404, "text/plain", "Not found. Use /health, /gate/open, /gate/test");
}

// ================= Setup =================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(LCD_SDA, LCD_SCL);
  lcd.init();
  lcd.backlight();
  showLCD("Starting...");

  gate.setPeriodHertz(50);
  gate.attach(SERVO_PIN, 500, 2400);
  gate.write(GATE_CLOSE_ANGLE);

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(ssid, password);
  showLCD("Connecting WiFi");
  Serial.print("Connecting to Wi-Fi");

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 30000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi failed");
    showLCD("WiFi FAILED");
    return;
  }

  Serial.print("Open browser: http://");
  Serial.println(WiFi.localIP());

  server.on("/health",    HTTP_GET, handleHealth);
  server.on("/gate/open", HTTP_GET, handleGateOpen);
  server.on("/gate/test", HTTP_GET, handleGateTest);
  server.onNotFound(handleNotFound);
  server.begin();

  showLCD("Gate Ready", WiFi.localIP().toString());
}

// ================= Loop =================
void loop() {
  if (WiFi.status() == WL_CONNECTED) server.handleClient();
  delay(2);
}