#include <WebServer.h>
#include <WiFi.h>
#include <Wire.h>

// ===========================
// แก้ไข WiFi ตรงนี้
// ===========================
const char *ssid = "YOUR_WIFI_SSID";
const char *password = "YOUR_WIFI_PASSWORD";

WebServer server(80);

// I2C Address ของ Nano
#define NANO_I2C_ADDR 8

const char *INDEX_HTML PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lotus Nano Bot RC</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background: #0f172a; color: #f8fafc;
            font-family: 'Segoe UI', sans-serif;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            min-height: 100vh; padding: 20px;
        }
        h1 { font-size: 1.5rem; margin-bottom: 5px; }
        p { color: #94a3b8; margin-bottom: 30px; }
        .d-pad {
            display: grid;
            grid-template-columns: repeat(3, 100px);
            grid-template-rows: repeat(3, 100px);
            gap: 12px;
        }
        .btn {
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            color: white; border-radius: 16px;
            font-size: 32px; cursor: pointer;
            display: flex; align-items: center;
            justify-content: center;
            user-select: none;
            -webkit-user-select: none;
            transition: background 0.1s, transform 0.1s;
        }
        .btn:active {
            background: #3b82f6;
            transform: scale(0.92);
        }
        .btn-up    { grid-column: 2; grid-row: 1; }
        .btn-left  { grid-column: 1; grid-row: 2; }
        .btn-stop  {
            grid-column: 2; grid-row: 2;
            border-color: #ef4444;
            color: #ef4444;
            font-weight: bold;
            font-size: 18px;
        }
        .btn-stop:active { background: #ef4444; color: white; }
        .btn-right { grid-column: 3; grid-row: 2; }
        .btn-down  { grid-column: 2; grid-row: 3; }
    </style>
</head>
<body>
    <h1>Lotus Nano Bot</h1>
    <p>รถบังคับผ่านเว็บ</p>

    <div class="d-pad">
        <button class="btn btn-up"    ontouchstart="send('F')" ontouchend="send('S')" onmousedown="send('F')" onmouseup="send('S')">&#9650;</button>
        <button class="btn btn-left"  ontouchstart="send('L')" ontouchend="send('S')" onmousedown="send('L')" onmouseup="send('S')">&#9664;</button>
        <button class="btn btn-stop"  onclick="send('S')">STOP</button>
        <button class="btn btn-right" ontouchstart="send('R')" ontouchend="send('S')" onmousedown="send('R')" onmouseup="send('S')">&#9654;</button>
        <button class="btn btn-down"  ontouchstart="send('B')" ontouchend="send('S')" onmousedown="send('B')" onmouseup="send('S')">&#9660;</button>
    </div>

    <script>
        function send(cmd) {
            fetch('/cmd?c=' + cmd).catch(() => {});
        }
    </script>
</body>
</html>
)rawliteral";

void setup() {
  Serial.begin(115200);

  Wire.begin();  // I2C Master (SDA=21, SCL=22)

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  server.on("/", []() {
    server.send(200, "text/html", INDEX_HTML);
  });

  server.on("/cmd", []() {
    if (server.hasArg("c")) {
      String c = server.arg("c");
      Wire.beginTransmission(NANO_I2C_ADDR);
      Wire.print(c);
      Wire.endTransmission();
      Serial.println("CMD: " + c);
      server.send(200, "text/plain", "OK");
    } else {
      server.send(400, "text/plain", "Bad Request");
    }
  });

  server.begin();
}

void loop() {
  server.handleClient();
}
