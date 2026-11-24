# KY-010 --- Light Blocking Sensor

## รายละเอียด

Light Blocking Sensor หรือ Slot-type IR Sensor เป็นเซนเซอร์ที่มีช่องว่างระหว่าง IR LED และ IR Receiver เมื่อมีวัตถุเข้ามาบดบังช่องว่าง เอาต์พุตจะเปลี่ยนสถานะ ใช้นับจำนวนวัตถุหรือตรวจจับการหมุน

## คุณสมบัติ

- แรงดันไฟฟ้า: 3.3V - 5V DC
- เอาต์พุต: Digital (DO) และ Analog (AO)
- มี LED แสดงสถานะ
- มีตัวปรับความไว (Potentiometer)

> **หมายเหตุ:** KY-010 รุ่นดั้งเดิมมี 3 ขา (S, +, -) ให้เฉพาะเอาต์พุต Digital ไม่มีตัวปรับค่า ส่วน AO และ Potentiometer มีเฉพาะโมดูลแบบ 4 ขาบางรุ่น หากใช้แบบ 3 ขาให้ต่อขา S เป็น DO

## ขาของเซนเซอร์

| ขา (Sensor) | สีสาย | เชื่อมต่อกับ (Lotus Nano Bot) |
|-------------|-------|------------------------------|
| VCC         | แดง   | 5V                           |
| GND         | ดำ/น้ำตาล | GND                       |
| DO (Digital)| เหลือง | D3 หรือ A1 (D15)          |
| AO (Analog) | ขาว   | A0 (optional, เฉพาะรุ่น 4 ขา) |

## การต่อสายไฟ

```
Light Blocking Sensor    Lotus Nano Bot
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VCC  ──────────────────► 5V
GND  ──────────────────► GND
DO   ──────────────────► D3
AO   ──────────────────► A0 (optional)
```

### ภาพการต่อสาย (Text Diagram)

```
        +------------------+
        |  Light Blocking  |
        |  Sensor          |
        |   [= =]          |
        |  Slot Type       |
   +----+----+   +----+----+   +----+----+   +----+----+
   |  VCC    |   |  GND    |   |  DO     |   |  AO     |
   |   (+)   |   |   (-)   |   | (Digi)  |   | (Anlg)  |
   +----+----+   +----+----+   +----+----+   +----+----+
        |             |             |             |
        |             |             |             |
   +----+----+   +----+----+   +----+----+   +----+----+
   |   5V    |   |  GND    |   |   D3    |   |   A0    |
   |         |   |         |   |         |   |         |
   |  Lotus  |   |  Nano   |   |  Bot    |   |         |
   +---------+   +---------+   +---------+   +---------+
```

## โค้ดตัวอย่าง

```cpp
// Light Blocking Sensor Example for Lotus Nano Bot
// DO -> D3

#define BLOCKING_PIN 3

int count = 0;
int lastState = HIGH;

void setup() {
  Serial.begin(9600);
  pinMode(BLOCKING_PIN, INPUT);
  Serial.println("Light Blocking Sensor Test Started");
}

void loop() {
  int state = digitalRead(BLOCKING_PIN);
  
  // นับเมื่อสถานะเปลี่ยนเป็น LOW (บางโมดูลเป็น HIGH เมื่อถูกบัง ให้ทดสอบก่อน)
  if (state != lastState && state == LOW) {
    count++;
    Serial.print("🚫 Object Detected! Count: ");
    Serial.println(count);
  }
  
  lastState = state;
  delay(10);
}
```

## โค้ดตัวอย่างนับรอบมอเตอร์ (Encoder)

```cpp
// ต้องใช้ D3 เพราะ Interrupt บน Nano มีเฉพาะ D2 (ปุ่มบนบอร์ด) และ D3
#define BLOCKING_PIN 3

volatile unsigned int count = 0;

void setup() {
  Serial.begin(9600);
  pinMode(BLOCKING_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(BLOCKING_PIN), countPulse, FALLING);
}

void loop() {
  noInterrupts();               // อ่านตัวแปร 2 ไบต์ให้ครบโดยไม่ถูก Interrupt แทรก
  unsigned int pulses = count;
  interrupts();
  
  Serial.print("Rotations: ");
  Serial.println(pulses / 20);  // สมมติ 20 รูต่อรอบ
  delay(500);
}

void countPulse() {
  count++;
}
```

## หมายเหตุ

- ใช้ attachInterrupt ที่ D3 (Interrupt 1 บน Nano) เพื่อนับแม่นยำ
- วางวงแหวนรูระหว่างช่องเซนเซอร์เพื่อนับรอบมอเตอร์
- หมุนตัวปรับค่าให้ LED เปลี่ยนสถานะตรงจุดที่ต้องการ
- บน Lotus Nano Bot D3 รองรับ Interrupt (INT1) ส่วน A0-A3 ใช้ attachInterrupt ไม่ได้ (ใช้ได้เฉพาะโค้ดแบบ polling)

## กิจกรรมการเรียนรู้

### จุดประสงค์การเรียนรู้
1. อธิบายหลักการทำงานของเซนเซอร์ตัดแสงแบบช่อง (Photo Interrupter) ได้
2. ต่อวงจร Light Blocking Sensor เข้ากับ D3 และนับจำนวนครั้งที่วัตถุผ่านช่องได้
3. เปรียบเทียบความแม่นยำของการนับแบบ Polling และแบบ Interrupt ได้

### ขั้นตอนการทดลอง
1. ต่อสาย VCC → 5V, GND → GND, DO → D3 แล้วอัปโหลดโค้ดตัวอย่างแรก
2. สอดกระดาษแข็งผ่านช่องเซนเซอร์ช้าๆ 10 ครั้ง บันทึกค่า Count
3. สอดกระดาษผ่านเร็วๆ 10 ครั้ง บันทึกค่า Count เปรียบเทียบ
4. อัปโหลดโค้ดแบบ Interrupt หมุนจานที่มีรู (หรือพัดกระดาษ) ผ่านช่อง สังเกตจำนวนพัลส์และรอบที่คำนวณได้

### ตารางบันทึกผล
| ครั้งที่ | สภาวะ/การกระทำ | ค่าที่อ่านได้ | ผลที่สังเกตได้ |
|---|---|---|---|
| 1 | ช่องว่าง ไม่มีวัตถุ | | |
| 2 | สอดกระดาษผ่านช้าๆ 10 ครั้ง (Polling) | | |
| 3 | สอดกระดาษผ่านเร็วๆ 10 ครั้ง (Polling / Interrupt) | | |

### คำถามท้ายการทดลอง
1. เอาต์พุตของเซนเซอร์เปลี่ยนไปอย่างไรเมื่อวัตถุบังแสงในช่อง
2. เมื่อสอดกระดาษเร็วๆ ค่าที่นับได้ตรงกับจำนวนจริงหรือไม่ เพราะเหตุใด
3. จะใช้เซนเซอร์นี้วัดระยะทางที่ล้อหุ่นยนต์เคลื่อนที่ได้อย่างไร

<details>
<summary>แนวคำตอบ (สำหรับครู)</summary>

1. เมื่อไม่มีวัตถุ แสง IR ส่องถึงตัวรับ เอาต์พุตอยู่สถานะหนึ่ง เมื่อวัตถุบัง เอาต์พุตจะสลับเป็นอีกสถานะ (ทิศทาง HIGH/LOW ขึ้นกับรุ่น)
2. แบบ Polling อาจนับขาดหรือนับซ้ำ (เด้ง) ถ้าวัตถุผ่านเร็วกว่ารอบการอ่าน ส่วนแบบ Interrupt ตอบสนองทันทีจึงแม่นยำกว่า
3. ติดจาน Encoder ที่มีรูจำนวนแน่นอนบนแกนล้อ นับพัลส์ หารด้วยจำนวนรูต่อรอบได้จำนวนรอบ แล้วคูณด้วยเส้นรอบวงล้อ (πd) ได้ระยะทาง

</details>

### ภารกิจท้าทาย
- สร้างเครื่องนับวัตถุบนสายพาน: แสดงจำนวนบนจอ OLED, ให้บัซเซอร์ส่งเสียงเมื่อนับครบ 10 ชิ้น (เปลี่ยนเซนเซอร์ไปที่ A1 แบบ polling เพราะ D3 ใช้กับบัซเซอร์) และกดปุ่ม D2 เพื่อรีเซ็ตตัวนับ

## รูปภาพ

![light-blocking-sensor](../../assets/images/light-blocking-sensor.jpg)

![light-blocking-sensor-wiring](../../assets/diagrams/light-blocking-sensor-wiring.png)

