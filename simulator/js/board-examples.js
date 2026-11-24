// Examples that use only the devices built into the Lotus Nano Bot.
export const BOARD_EXAMPLES = [
  {
    title: 'ปุ่ม D2 + Knob A7 + จอ OLED',
    code: `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 OLED(128, 64, &Wire, -1);

void setup() {
  Serial.begin(9600);
  OLED.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  pinMode(2, INPUT);        // ปุ่ม OK บนบอร์ด (กด = LOW)
}

void loop() {
  int sw  = digitalRead(2);
  int nob = analogRead(A7); // Knob บนบอร์ด 0-1023

  OLED.clearDisplay();
  OLED.setTextColor(WHITE);
  OLED.setTextSize(1);
  OLED.setCursor(0, 0);
  OLED.println(" LOTUS NANO BOT");
  OLED.setTextSize(2);
  OLED.setCursor(0, 20);
  OLED.print("SW: ");
  OLED.println(sw);
  OLED.print("VR: ");
  OLED.println(nob);
  OLED.display();

  Serial.print("Button=");
  Serial.print(sw);
  Serial.print("  Knob=");
  Serial.println(nob);
  delay(100);
}
`,
  },
  {
    title: 'Blink: LED L บน Nano (D13)',
    code: `void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}
`,
  },
  {
    title: 'บัซเซอร์ D3: กดปุ่มเล่นเพลง',
    code: `int melody[]   = {262, 262, 392, 392, 440, 440, 392, 349, 349, 330, 330, 294, 294, 262};
int duration[] = {4, 4, 4, 4, 4, 4, 2, 4, 4, 4, 4, 4, 4, 2};

void setup() {
  pinMode(2, INPUT);
}

void loop() {
  if (digitalRead(2) == LOW) {
    for (int i = 0; i < 14; i++) {
      int ms = 1000 / duration[i];
      tone(3, melody[i], ms);
      delay(ms * 1.3);
    }
    noTone(3);
  }
}
`,
  },
  {
    title: 'มอเตอร์: กดปุ่มแล้ววิ่ง (TB6612)',
    code: `#define DL1 9
#define DL2 4
#define PWML 5
#define DR1 7
#define DR2 8
#define PWMR 6

void run(int spl, int spr) {
  digitalWrite(DL1, spl >= 0 ? LOW : HIGH);
  digitalWrite(DL2, spl >= 0 ? HIGH : LOW);
  analogWrite(PWML, abs(spl));
  digitalWrite(DR1, spr >= 0 ? LOW : HIGH);
  digitalWrite(DR2, spr >= 0 ? HIGH : LOW);
  analogWrite(PWMR, abs(spr));
}

void setup() {
  pinMode(DL1, OUTPUT); pinMode(DL2, OUTPUT); pinMode(PWML, OUTPUT);
  pinMode(DR1, OUTPUT); pinMode(DR2, OUTPUT); pinMode(PWMR, OUTPUT);
  pinMode(2, INPUT);
}

void loop() {
  if (digitalRead(2) == LOW) {
    tone(3, 1000, 200);
    run(150, 150);  delay(1000);   // เดินหน้า
    run(-150, 150); delay(500);    // หมุนซ้าย
    run(-150, -150); delay(1000);  // ถอยหลัง
    run(0, 0);
  }
}
`,
  },
  {
    title: 'เซอร์โว SV1 (D10) ตาม Knob',
    code: `#include <Servo.h>

Servo sv1;

void setup() {
  sv1.attach(10);
  Serial.begin(9600);
}

void loop() {
  int vr = analogRead(A7);
  int angle = map(vr, 0, 1023, 0, 180);
  sv1.write(angle);
  Serial.println(angle);
  delay(20);
}
`,
  },
];
