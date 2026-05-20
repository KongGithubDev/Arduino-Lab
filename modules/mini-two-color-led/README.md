# KY-029 --- Mini Two-color LED Module

## รายละเอียด

Mini Two-color LED Module เป็นโมดูล LED 2 สีขนาดเล็ก (มักเป็น Red และ Green) ทำงานเหมือน Two-color LED ทั่วไปแต่ขนาดกะทัดรัด

## คุณสมบัติ

- แรงดันไฟฟ้า: 3.3V - 5V DC
- สี: Red และ Green
- ควบคุมด้วย PWM หรือ Digital
- ขนาดเล็ก

## ขาของโมดูล

| ขา (Module) | สีสาย | เชื่อมต่อกับ (Lotus Nano Bot) |
|-------------|-------|------------------------------|
| VCC หรือ - | แดง   | 5V หรือ GND (ขึ้นอยู่กับรุ่น) |
| R (Red)     | เหลือง | D3 หรือ D5/D6/D9 (PWM)     |
| G (Green)   | เขียว | D3 หรือ D5/D6/D9 (PWM)     |

## การต่อสายไฟ (Common Cathode)

```
Mini Two-color LED       Lotus Nano Bot
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VCC (-) ───────────────► GND
R ─────────────────────► D5 (PWM)
G ─────────────────────► D6 (PWM)
```

### ภาพการต่อสาย (Text Diagram)

```
        +------------------+
        | Mini Two-color   |
        |    LED           |
        |    [*] (Mini)    |
        |                  |
   +----+----+   +----+----+   +----+----+
   |  VCC    |   |   R     |   |   G     |
   |   (-)   |   |  (PWM)  |   |  (PWM)  |
   +----+----+   +----+----+   +----+----+
        |             |             |
        |             |             |
   +----+----+   +----+----+   +----+----+
   |  GND    |   |   D5    |   |   D6    |
   |         |   |         |   |         |
   |  Lotus  |   |  Nano   |   |  Bot    |
   +---------+   +---------+   +---------+
```

## โค้ดตัวอย่าง

```cpp
// Mini Two-color LED Example for Lotus Nano Bot
// R->D5, G->D6

#define RED_PIN 5
#define GREEN_PIN 6

void setup() {
  Serial.begin(9600);
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  Serial.println("Mini Two-color LED Test Started");
}

void loop() {
  // Red
  digitalWrite(RED_PIN, HIGH);
  digitalWrite(GREEN_PIN, LOW);
  delay(1000);
  
  // Green
  digitalWrite(RED_PIN, LOW);
  digitalWrite(GREEN_PIN, HIGH);
  delay(1000);
  
  // Orange
  digitalWrite(RED_PIN, HIGH);
  digitalWrite(GREEN_PIN, HIGH);
  delay(1000);
  
  // Off
  digitalWrite(RED_PIN, LOW);
  digitalWrite(GREEN_PIN, LOW);
  delay(1000);
}
```

## หมายเหตุ

- ทำงานเหมือน Two-color LED ทั่วไปแต่ขนาดเล็กกว่า
- ตรวจสอบว่าเป็น Common Cathode หรือ Common Anode
- บน Lotus Nano Bot ใช้ D5, D6, D9 สำหรับ PWM (แต่เป็นขามอเตอร์/เซอร์โว)
- ใช้ D3 ได้แต่ต้องระวังเพราะต่อกับบัซเซอร์

## รูปภาพ

![mini-two-color-led](../../assets/images/mini-two-color-led.jpg)

![mini-two-color-led-wiring](../../assets/diagrams/mini-two-color-led-wiring.png)

