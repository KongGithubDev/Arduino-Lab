# KY-038 --- Small Sound Sensor

## รายละเอียด

Small Sound Sensor เป็นเซนเซอร์ตรวจจับเสียงขนาดเล็ก ใช้ Microphone Electret รับเสียงและแปลงเป็นสัญญาณไฟฟ้า มีวงจรเปรียบเทียบในตัว

## คุณสมบัติ

- แรงดันไฟฟ้า: 3.3V - 5V DC
- เอาต์พุต: Digital (DO) และ Analog (AO)
- มีตัวปรับความไว (Potentiometer)
- มี LED แสดงสถานะ

## ขาของเซนเซอร์

| ขา (Sensor) | สีสาย | เชื่อมต่อกับ (Lotus Nano Bot) |
|-------------|-------|------------------------------|
| VCC         | แดง   | 5V                           |
| GND         | ดำ/น้ำตาล | GND                       |
| DO (Digital)| เหลือง | D3 หรือ A1 (D15)          |
| AO (Analog) | ขาว   | A0, A1, A2, A3 หรือ A6 (ห้ามใช้ขาเดียวกับ DO) |

## การต่อสายไฟ

```
Small Sound Sensor       Lotus Nano Bot
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VCC  ──────────────────► 5V
GND  ──────────────────► GND
DO   ──────────────────► D3
AO   ──────────────────► A0 (optional)
```

### ภาพการต่อสาย (Text Diagram)

```
        +------------------+
        |  Small Sound     |
        |  Sensor          |
        |    (o)           |
        |  Microphone      |
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
// Small Sound Sensor Example for Lotus Nano Bot
// DO -> D3, AO -> A0

#define SOUND_DIGITAL_PIN 3
#define SOUND_ANALOG_PIN A0

void setup() {
  Serial.begin(9600);
  pinMode(SOUND_DIGITAL_PIN, INPUT);
  Serial.println("Small Sound Sensor Test Started");
}

void loop() {
  int soundDetected = digitalRead(SOUND_DIGITAL_PIN);
  int soundLevel = analogRead(SOUND_ANALOG_PIN);
  
  Serial.print("Digital: ");
  Serial.print(soundDetected);
  Serial.print(" | Analog: ");
  Serial.println(soundLevel);
  
  if (soundDetected == HIGH) {  // ตรวจพบเสียง
    Serial.println("🔊 Sound Detected!");
    delay(300);  // Debounce
  }
  
  delay(50);
}
```

## โค้ดตัวอย่าง Clap Switch (ปรบมือเปิดปิด)

```cpp
#define SOUND_PIN 3
#define LED_PIN 13

bool ledState = false;
unsigned long lastClap = 0;
int clapCount = 0;

void setup() {
  Serial.begin(9600);
  pinMode(SOUND_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  if (digitalRead(SOUND_PIN) == HIGH) {
    unsigned long now = millis();
    
    if (now - lastClap > 200) {
      clapCount++;
      lastClap = now;
      Serial.print("Clap #");
      Serial.println(clapCount);
      
      if (clapCount >= 2) {
        ledState = !ledState;
        digitalWrite(LED_PIN, ledState);
        Serial.println(ledState ? "💡 LED ON" : "🌑 LED OFF");
        clapCount = 0;
      }
    }
    delay(300);
  }
  
  // รีเซ็ตถ้าไม่มีเสียงนานเกิน 1 วินาที
  if (millis() - lastClap > 1000) {
    clapCount = 0;
  }
}
```

## หมายเหตุ

- หมุนตัวปรับค่าเพื่อกำหนดความไวในการตรวจจับเสียง
- ควรใช้ Debounce เพื่อป้องกันการอ่านค่าซ้ำ
- ไม่เหมาะสำหรับบันทึกเสียงคุณภาพสูง
- บน Lotus Nano Bot ใช้ D3 หรือ A0-A3 (เป็น Digital) ได้
- D3 ต่อร่วมกับบัซเซอร์บนบอร์ด อาจได้ยินเสียงคลิกเบาๆ เมื่อสัญญาณเปลี่ยน หากไม่ต้องการให้ย้ายไป A0-A3 (D14-D17)

## กิจกรรมการเรียนรู้

### จุดประสงค์การเรียนรู้
1. นักเรียนสามารถอ่านค่าเสียงจากเซนเซอร์ทั้งแบบ Digital และ Analog ได้
2. นักเรียนสามารถปรับ Potentiometer ให้เซนเซอร์ตรวจจับเสียงปรบมือได้อย่างเหมาะสม
3. นักเรียนสามารถอธิบายการทำงานของโปรแกรม Clap Switch (นับการปรบมือ 2 ครั้ง) ได้

### ขั้นตอนการทดลอง
1. ต่อ DO -> D3 และ AO -> A0 แล้วอัปโหลดโค้ดตัวอย่างแรก
2. เปิด Serial Monitor บันทึกค่า Analog ขณะห้องเงียบ ขณะพูด และขณะปรบมือ
3. หมุน Potentiometer จน LED บนโมดูลดับขณะเงียบ แต่ติดเมื่อปรบมือ
4. อัปโหลดโค้ด Clap Switch แล้วปรบมือ 2 ครั้งติดกันเพื่อเปิด/ปิด LED D13
5. ทดลองปรบมือ 2 ครั้งห่างกันมากกว่า 1 วินาที แล้วสังเกตผล

### ตารางบันทึกผล
| ครั้งที่ | สภาวะ/การกระทำ | ค่าที่อ่านได้ | ผลที่สังเกตได้ |
|---|---|---|---|
| 1 | ห้องเงียบ | | |
| 2 | พูดเสียงปกติห่าง 30 cm | | |
| 3 | ปรบมือ 1 ครั้ง | | |
| 4 | ปรบมือ 2 ครั้งติดกัน (Clap Switch) | | |

### คำถามท้ายการทดลอง
1. ไมโครโฟน Electret แปลงเสียงเป็นสัญญาณไฟฟ้าได้อย่างไร และ Potentiometer มีหน้าที่อะไร
2. ทำไมค่า Analog ที่อ่านได้ขณะปรบมือจึงไม่คงที่ แม้ปรบมือแรงเท่าเดิม
3. จะนำเซนเซอร์เสียงไปใช้สั่งงานหุ่นยนต์ได้อย่างไร

<details>
<summary>แนวคำตอบ (สำหรับครู)</summary>

1. แรงสั่นของอากาศทำให้แผ่นไดอะแฟรมสั่น เกิดการเปลี่ยนแปลงความจุไฟฟ้าและแรงดัน Potentiometer ใช้ตั้งระดับเปรียบเทียบ (Threshold) ของเอาต์พุต DO
2. เสียงเป็นคลื่นที่ขึ้นลงเร็วมาก การอ่าน `analogRead()` แต่ละครั้งได้ค่า ณ จุดเวลาหนึ่งของคลื่นเท่านั้น จึงต้องอ่านหลายครั้งแล้วหาค่าสูงสุด
3. เช่น ปรบมือ 1 ครั้งให้หุ่นเดินหน้า 2 ครั้งให้หยุด หรือหุ่นหันหาทิศที่มีเสียงดัง

</details>

### ภารกิจท้าทาย
- ทำหุ่นยนต์สั่งด้วยเสียงปรบมือ: ปรบมือ 2 ครั้งให้มอเตอร์เดินหน้า 1 วินาทีแล้วหยุด และแสดงจำนวนครั้งที่ปรบมือบนจอ OLED

## รูปภาพ

![small-sound-sensor](../../assets/images/small-sound-sensor.jpg)

![small-sound-sensor-wiring](../../assets/diagrams/small-sound-sensor-wiring.png)

