# KY-016 --- RGB LED Module

## รายละเอียด

RGB LED Module เป็นโมดูล LED ที่มี LED สีแดง (Red), เขียว (Green), น้ำเงิน (Blue) รวมในหลอดเดียว สามารถผสมสีได้โดยใช้ PWM (Pulse Width Modulation) ควบคุมความสว่างของแต่ละสี

## คุณสมบัติ

- แรงดันไฟฟ้า: 5V DC
- ควบคุมด้วย PWM (3 ขา: R, G, B)
- มีตัวต้านทานจำกัดกระแสในตัว
- สามารถสร้างสีได้หลายล้านสี

## ขาของโมดูล

| ขา (Module) | สีสาย | เชื่อมต่อกับ (Lotus Nano Bot) |
|-------------|-------|------------------------------|
| VCC หรือ - | แดง   | 5V หรือ GND (ขึ้นอยู่กับรุ่น) |
| R (Red)     | เหลือง | D3 หรือ D5/D6/D9 (PWM)     |
| G (Green)   | เขียว | D3 หรือ D5/D6/D9 (PWM)     |
| B (Blue)    | น้ำเงิน | D3 หรือ D5/D6/D9 (PWM)    |

> **หมายเหตุ:** บางรุ่นเป็น Common Cathode (VCC ต่อ GND, R/G/B ต่อ PWM) บางรุ่นเป็น Common Anode (VCC ต่อ 5V, R/G/B ต่อ PWM LOW)

## การต่อสายไฟ (Common Cathode)

```
RGB LED Module           Lotus Nano Bot
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VCC (-) ───────────────► GND
R ─────────────────────► D5 (PWM)
G ─────────────────────► D6 (PWM)
B ─────────────────────► D9 (PWM)
```

### ภาพการต่อสาย (Text Diagram)

```
        +------------------+
        |   RGB LED        |
        |   Module         |
        |    [*]           |
        |                  |
   +----+----+   +----+----+   +----+----+   +----+----+
   |  VCC    |   |   R     |   |   G     |   |   B     |
   |   (-)   |   |  (PWM)  |   |  (PWM)  |   |  (PWM)  |
   +----+----+   +----+----+   +----+----+   +----+----+
        |             |             |             |
        |             |             |             |
   +----+----+   +----+----+   +----+----+   +----+----+
   |  GND    |   |   D5    |   |   D6    |   |   D9    |
   |         |   |         |   |         |   |         |
   |  Lotus  |   |  Nano   |   |  Bot    |   |         |
   +---------+   +---------+   +---------+   +---------+
```

## โค้ดตัวอย่าง

```cpp
// RGB LED Example for Lotus Nano Bot
// Common Cathode: R->D5, G->D6, B->D9

#define RED_PIN 5
#define GREEN_PIN 6
#define BLUE_PIN 9

void setup() {
  Serial.begin(9600);
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);
  Serial.println("RGB LED Test Started");
}

void loop() {
  // Red
  setColor(255, 0, 0);
  delay(1000);
  
  // Green
  setColor(0, 255, 0);
  delay(1000);
  
  // Blue
  setColor(0, 0, 255);
  delay(1000);
  
  // Yellow
  setColor(255, 255, 0);
  delay(1000);
  
  // Cyan
  setColor(0, 255, 255);
  delay(1000);
  
  // Purple
  setColor(255, 0, 255);
  delay(1000);
  
  // White
  setColor(255, 255, 255);
  delay(1000);
}

void setColor(int red, int green, int blue) {
  analogWrite(RED_PIN, red);
  analogWrite(GREEN_PIN, green);
  analogWrite(BLUE_PIN, blue);
}
```

## โค้ดตัวอย่างไล่สี Rainbow

```cpp
#define RED_PIN 5
#define GREEN_PIN 6
#define BLUE_PIN 9

void setup() {
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);
}

void loop() {
  // ไล่สีแบบ Rainbow
  for (int i = 0; i <= 255; i++) {
    setColor(255 - i, i, 0);    // Red -> Green
    delay(10);
  }
  
  for (int i = 0; i <= 255; i++) {
    setColor(0, 255 - i, i);    // Green -> Blue
    delay(10);
  }
  
  for (int i = 0; i <= 255; i++) {
    setColor(i, 0, 255 - i);    // Blue -> Red
    delay(10);
  }
}

void setColor(int red, int green, int blue) {
  analogWrite(RED_PIN, red);
  analogWrite(GREEN_PIN, green);
  analogWrite(BLUE_PIN, blue);
}
```

## หมายเหตุ

- ตรวจสอบว่าเป็น Common Cathode หรือ Common Anode ก่อนใช้งาน
- Common Anode: VCC -> 5V, R/G/B -> PWM (LOW = สว่าง)
- Common Cathode: VCC -> GND, R/G/B -> PWM (HIGH = สว่าง)
- บน Lotus Nano Bot ใช้ D5, D6, D9 สำหรับ PWM (แต่เป็นขามอเตอร์/เซอร์โวด้วย)
- หากใช้ D3 ต้องระวังเพราะต่อกับบัซเซอร์

## รูปภาพ

![rgb-led](../../assets/images/rgb-led.jpg)

![rgb-led-wiring](../../assets/diagrams/rgb-led-wiring.png)

