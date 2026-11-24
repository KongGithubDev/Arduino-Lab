# KY-023 --- Joystick Module

## รายละเอียด

Joystick Module เป็นโมดูลจอยสติ๊กแบบ Analog 2 แกน (X, Y) พร้อมปุ่มกด (Z/Button) ใช้ตัวต้านทานปรับค่าได้ 2 ตัวตามแกน X และ Y

## คุณสมบัติ

- แรงดันไฟฟ้า: 5V DC
- แกน X, Y: Analog (0-1023)
- ปุ่ม Z: Digital (Active Low)
- ใช้ตัวต้านทานปรับค่าได้ 2 ตัว (10KΩ)

## ขาของโมดูล

| ขา (Module) | สีสาย | เชื่อมต่อกับ (Lotus Nano Bot) |
|-------------|-------|------------------------------|
| VCC         | แดง   | 5V                           |
| GND         | ดำ/น้ำตาล | GND                       |
| VRX (X)     | เหลือง | A0                          |
| VRY (Y)     | ขาว   | A1 หรือ A2, A3, A6         |
| SW (Button) | ส้ม   | D3 หรือ A2 (D16) (INPUT_PULLUP) |

## การต่อสายไฟ

```
Joystick Module          Lotus Nano Bot
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VCC  ──────────────────► 5V
GND  ──────────────────► GND
VRX  ──────────────────► A0
VRY  ──────────────────► A1
SW   ──────────────────► D3 (INPUT_PULLUP)
```

### ภาพการต่อสาย (Text Diagram)

```
        +------------------+
        |  Joystick        |
        |   Module         |
        |     \   /        |
        |      \ /         |
        |       O  (SW)    |
   +----+----+   +----+----+   +----+----+   +----+----+   +----+----+
   |  VCC    |   |  GND    |   |  VRX    |   |  VRY    |   |  SW     |
   |   (+)   |   |   (-)   |   |   (X)   |   |   (Y)   |   | (Btn)   |
   +----+----+   +----+----+   +----+----+   +----+----+   +----+----+
        |             |             |             |             |
        |             |             |             |             |
   +----+----+   +----+----+   +----+----+   +----+----+   +----+----+
   |   5V    |   |  GND    |   |   A0    |   |   A1    |   |   D3    |
   |         |   |         |   |         |   |         |   |         |
   |  Lotus  |   |  Nano   |   |  Bot    |   |         |   |         |
   +---------+   +---------+   +---------+   +---------+   +---------+
```

## โค้ดตัวอย่าง

```cpp
// Joystick Module Example for Lotus Nano Bot
// VRX -> A0, VRY -> A1, SW -> D3

#define JOY_X_PIN A0
#define JOY_Y_PIN A1
#define JOY_SW_PIN 3

void setup() {
  Serial.begin(9600);
  pinMode(JOY_SW_PIN, INPUT_PULLUP);
  Serial.println("Joystick Test Started");
}

void loop() {
  int xValue = analogRead(JOY_X_PIN);
  int yValue = analogRead(JOY_Y_PIN);
  int buttonState = digitalRead(JOY_SW_PIN);
  
  Serial.print("X: ");
  Serial.print(xValue);
  Serial.print(" | Y: ");
  Serial.print(yValue);
  Serial.print(" | Button: ");
  Serial.println(buttonState == LOW ? "PRESSED" : "RELEASED");
  
  // แปลงค่าเป็นทิศทาง
  if (xValue < 400) {
    Serial.println("⬅️  Left");
  } else if (xValue > 600) {
    Serial.println("➡️  Right");
  }
  
  if (yValue < 400) {
    Serial.println("⬆️  Up");
  } else if (yValue > 600) {
    Serial.println("⬇️  Down");
  }
  
  delay(200);
}
```

## โค้ดตัวอย่างควบคุมมอเตอร์ Lotus Nano Bot

```cpp
#define JOY_X_PIN A0
#define JOY_Y_PIN A1

// Motor pins (Lotus Nano Bot)
#define DL1  9
#define DL2  4
#define PWML 5
#define DR1  7
#define DR2  8
#define PWMR 6

void setup() {
  Serial.begin(9600);
  
  pinMode(DL1, OUTPUT);
  pinMode(DL2, OUTPUT);
  pinMode(PWML, OUTPUT);
  pinMode(DR1, OUTPUT);
  pinMode(DR2, OUTPUT);
  pinMode(PWMR, OUTPUT);
}

void loop() {
  int x = analogRead(JOY_X_PIN);
  int y = analogRead(JOY_Y_PIN);
  
  // แปลงเป็น -255 ถึง 255 (ดันขึ้น y น้อย = ค่าลบ = เดินหน้า ตามทิศใน run())
  int speed = map(y, 0, 1023, -255, 255);

  // เลี้ยวด้วยแกน X
  int turn = map(x, 0, 1023, -128, 128);

  // Dead zone: ตัดค่าเล็ก ๆ ใกล้ตำแหน่งกลาง ไม่ให้มอเตอร์ครางตอนปล่อยจอย
  if (abs(speed) < 30) speed = 0;
  if (abs(turn) < 20) turn = 0;

  int leftSpeed = speed + turn;
  int rightSpeed = speed - turn;

  // จำกัดค่าไม่ให้เกินช่วง PWM
  leftSpeed = constrain(leftSpeed, -255, 255);
  rightSpeed = constrain(rightSpeed, -255, 255);
  
  run(leftSpeed, rightSpeed);
  delay(50);
}

void run(int spl, int spr) {
  if (spl > 0) {
    digitalWrite(DL1, LOW); digitalWrite(DL2, HIGH); analogWrite(PWML, spl);
  } else if (spl < 0) {
    digitalWrite(DL1, HIGH); digitalWrite(DL2, LOW); analogWrite(PWML, -spl);
  } else {
    digitalWrite(DL1, LOW); digitalWrite(DL2, LOW); analogWrite(PWML, 0);
}
  
  if (spr > 0) {
    digitalWrite(DR1, LOW); digitalWrite(DR2, HIGH); analogWrite(PWMR, spr);
  } else if (spr < 0) {
    digitalWrite(DR1, HIGH); digitalWrite(DR2, LOW); analogWrite(PWMR, -spr);
  } else {
    digitalWrite(DR1, LOW); digitalWrite(DR2, LOW); analogWrite(PWMR, 0);
}
}
```

## หมายเหตุ

- ค่ากลางประมาณ 512 (2.5V) ทั้งแกน X และ Y
- ปุ่ม SW ต้องใช้ `INPUT_PULLUP` เพราะไม่มีตัวต้านทาน Pull-up ในตัว
- ใช้ได้กับการควบคุมหุ่นยนต์, เกม, หรือ Servo
- บน Lotus Nano Bot ใช้ A0-A3, A6 สำหรับอนาลอก และ D3 หรือ A2/A3 สำหรับปุ่ม (A6 อ่านได้แค่ `analogRead()` ใช้กับปุ่มแบบ `digitalRead()` ไม่ได้)
- ตัวอย่างควบคุมมอเตอร์ใช้ขา D4-D9 ของมอเตอร์ในตัวบอร์ด ห้ามต่อจอยสติ๊กหรืออุปกรณ์อื่นที่ขาเหล่านี้
- หากรถวิ่งกลับทิศ ให้สลับสายมอเตอร์ หรือสลับ HIGH/LOW ของ DL1/DL2 (DR1/DR2) ในฟังก์ชัน `run()`

## กิจกรรมการเรียนรู้

### จุดประสงค์การเรียนรู้
1. นักเรียนอ่านค่าแกน X, Y (0-1023) และสถานะปุ่ม SW ของจอยสติ๊กได้
2. นักเรียนใช้ `map()` และ Dead zone แปลงค่าอนาลอกเป็นความเร็วมอเตอร์ได้
3. นักเรียนบังคับ Lotus Nano Bot ให้เดินหน้า ถอยหลัง และเลี้ยวด้วยจอยสติ๊กได้

### ขั้นตอนการทดลอง
1. ต่อสาย VRX→A0, VRY→A1, SW→D3 อัปโหลดโค้ดตัวอย่างแรก แล้วเปิด Serial Monitor
2. บันทึกค่า X, Y เมื่อปล่อยจอยไว้ตรงกลาง และเมื่อดันสุดแต่ละทิศ
3. ยกล้อรถให้ลอยจากพื้น แล้วอัปโหลดโค้ดควบคุมมอเตอร์ ทดสอบทิศการหมุนของล้อ
4. ทดลองเปลี่ยนค่า Dead zone (30 → 0 และ 80) สังเกตอาการของมอเตอร์ตอนปล่อยจอย

### ตารางบันทึกผล
| ครั้งที่ | สภาวะ/การกระทำ | ค่าที่อ่านได้ | ผลที่สังเกตได้ |
|---|---|---|---|
| 1 | ปล่อยจอยไว้ตรงกลาง | X = , Y = | |
| 2 | ดันขึ้นสุด | X = , Y = | |
| 3 | ดันขวาสุด | X = , Y = | |

### คำถามท้ายการทดลอง
1. ทำไมค่ากลางของจอยสติ๊กจึงไม่ใช่ 512 พอดี
2. ถ้าไม่มี Dead zone จะเกิดอะไรขึ้นกับมอเตอร์เมื่อปล่อยจอย เพราะอะไร
3. ถ้าต้องการให้รถวิ่งช้าลงเพื่อความแม่นยำ ควรแก้โค้ดส่วนใด

<details>
<summary>แนวคำตอบ (สำหรับครู)</summary>

1. ตัวต้านทานปรับค่าในจอยมีค่าคลาดเคลื่อนจากการผลิตและสปริงคืนตัวไม่ตรงกลางพอดี จึงได้ราว 490-530
2. ค่าที่แกว่งเล็กน้อยจะถูกแปลงเป็น PWM ต่ำ ๆ ทำให้มอเตอร์ครางหรือหมุนช้า ๆ เอง เปลืองแบตเตอรี่
3. ลดช่วงใน `map()` เช่น `map(y, 0, 1023, -150, 150)` หรือคูณความเร็วด้วยตัวคูณ เช่น 0.6

</details>

### ภารกิจท้าทาย
- ใช้ปุ่ม SW ของจอยสติ๊กเป็น "แตร" ให้บัซเซอร์ในตัว (D3) ดังขณะกด โดยย้ายสาย SW ไปที่ A2 (`#define JOY_SW_PIN 16`) เพื่อไม่ให้ชนกับบัซเซอร์

## รูปภาพ

![joystick-module](../../assets/images/joystick-module.jpg)

![joystick-module-wiring](../../assets/diagrams/joystick-module-wiring.png)

