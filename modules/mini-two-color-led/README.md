# KY-029 --- Mini Two-color LED Module

## รายละเอียด

Mini Two-color LED Module เป็นโมดูล LED 2 สีขนาดเล็ก (มักเป็น Red และ Green) ทำงานเหมือน Two-color LED ทั่วไปแต่ขนาดกะทัดรัด

## คุณสมบัติ

- แรงดันไฟฟ้า: 3.3V - 5V DC
- สี: Red และ Green
- ควบคุมด้วย Digital (บน Lotus Nano Bot ใช้ A0-A3) หรือ PWM (บนหัวต่อใช้ D10/D11 ได้เมื่อไม่ได้เสียบเซอร์โว)
- ขนาดเล็ก

## ขาของโมดูล

| ขา (Module) | สีสาย | เชื่อมต่อกับ (Lotus Nano Bot) |
|-------------|-------|------------------------------|
| - (Common)  | ดำ    | GND (Common Cathode) หรือ 5V (Common Anode) |
| R (Red)     | เหลือง | A0 (D14)                    |
| G (Green)   | เขียว | A1 (D15)                    |

> ต่อที่หัวต่อพอร์ต A0, A1 บนบอร์ด: ช่องขาวของ A0 = R, ช่องขาวของ A1 = G, ขา - (Common) ต่อช่องดำ = GND (Common Anode ต่อช่องแดง = 5V)

## การต่อสายไฟ (Common Cathode)

```
Mini Two-color LED       Lotus Nano Bot
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ──────────────────► GND
R ──────────────────► A0 (D14)
G ──────────────────► A1 (D15)
```

### ภาพการต่อสายกับบอร์ด

![ภาพการต่อสายกับ Lotus Nano Bot](../../assets/diagrams/mini-two-color-led-lotus.png)

## โค้ดตัวอย่าง

```cpp
// Mini Two-color LED Example for Lotus Nano Bot
// R->A0 (D14), G->A1 (D15)

#define RED_PIN 14    // A0
#define GREEN_PIN 15  // A1

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
- **เรื่อง PWM:** ขา PWM ฮาร์ดแวร์ที่เข้าถึงได้จากหัวต่อของ Lotus Nano Bot คือ D10 (ช่อง SV1) และ D11 (ช่อง SV2) ใช้ได้เมื่อไม่ได้เสียบเซอร์โวที่ช่องนั้น (Servo library ปิด PWM ของ D9/D10 จึงห้ามใช้ `analogWrite()` ร่วมกับเซอร์โว) ส่วน D3 แม้เป็นขา PWM แต่ต่อร่วมกับบัซเซอร์ในตัว (จะมีเสียงหวีด) จึงไม่ต่อโมดูลที่ D3 หากต้องการไล่ความสว่างด้วย `analogWrite()` ให้ย้ายขาสีไปที่ D10/D11 ไม่เช่นนั้นใช้ Software PWM บน A0-A3
- ขา A0-A3 ไม่ใช่ขา PWM ถ้าใช้ `analogWrite()` จะได้แค่ดับ (ค่า < 128) หรือติดเต็ม (ค่า ≥ 128) เท่านั้น จึงควรใช้ `digitalWrite()` หรือ Software PWM (ดูตัวอย่างใน Two-color LED)
- ห้ามต่อ LED ที่ D3 (บัซเซอร์ในตัว) และ D4-D9 (มอเตอร์ ไม่ได้อยู่บนหัวต่อ) ส่วน D10-D12 ใช้ได้เฉพาะเมื่อไม่ได้เสียบเซอร์โวที่ช่องนั้น

## กิจกรรมการเรียนรู้

### จุดประสงค์การเรียนรู้
1. นักเรียนต่อ Mini Two-color LED เข้ากับขา A0, A1 และสั่งแสดงสีแดง เขียว ส้มได้
2. นักเรียนตรวจสอบได้ว่าโมดูลเป็น Common Cathode หรือ Common Anode จากผลการทดลอง
3. นักเรียนอธิบายได้ว่าทำไม `analogWrite()` บนขา A0-A3 จึงปรับความสว่างไม่ได้

### ขั้นตอนการทดลอง
1. ต่อสาย -→GND, R→A0, G→A1 แล้วอัปโหลดโค้ดตัวอย่าง
2. บันทึกสีที่เห็นในแต่ละช่วง 1 วินาที เทียบกับคอมเมนต์ในโค้ด
3. ถ้าสีกลับกัน (สั่งติดแต่ดับ) ให้ย้ายขา - ไป 5V แล้วทดสอบใหม่ เพื่อหาชนิดของโมดูล
4. ทดลองแก้เป็น `analogWrite(RED_PIN, 100)` และ `analogWrite(RED_PIN, 200)` แล้วเปรียบเทียบความสว่าง

### ตารางบันทึกผล
| ครั้งที่ | สภาวะ/การกระทำ | ค่าที่อ่านได้ | ผลที่สังเกตได้ |
|---|---|---|---|
| 1 | R = HIGH, G = LOW | | |
| 2 | R = HIGH, G = HIGH | | |
| 3 | `analogWrite(14, 100)` และ `analogWrite(14, 200)` | | |

### คำถามท้ายการทดลอง
1. Common Cathode กับ Common Anode ต่างกันอย่างไร
2. ทำไม `analogWrite(14, 100)` ทำให้ LED ดับ แต่ `analogWrite(14, 200)` ทำให้ติดเต็มที่
3. ถ้าจะใช้ LED นี้เป็นไฟสถานะแบตเตอรี่ของหุ่นยนต์ ควรกำหนดสีอย่างไร

<details>
<summary>แนวคำตอบ (สำหรับครู)</summary>

1. Common Cathode ขาร่วมต่อ GND สั่ง HIGH เพื่อติด ส่วน Common Anode ขาร่วมต่อ 5V สั่ง LOW เพื่อติด
2. A0 ไม่ใช่ขา PWM ฟังก์ชัน `analogWrite()` จึงทำงานแบบ Digital ค่า < 128 = LOW, ≥ 128 = HIGH
3. เช่น เขียว = แบตเต็ม, ส้ม (แดง+เขียว) = ปานกลาง, แดง = ต่ำ ควรชาร์จ

</details>

### ภารกิจท้าทาย
- อ่านค่า Knob ในตัว (A7) แล้วแสดงสีตามช่วงค่า: 0-340 = เขียว, 341-680 = ส้ม, 681-1023 = แดง และให้บัซเซอร์ในตัว (D3) ดังเตือนเมื่อเป็นสีแดง

## รูปภาพ

![mini-two-color-led](../../assets/images/mini-two-color-led.jpg)

![mini-two-color-led-wiring](../../assets/diagrams/mini-two-color-led-wiring.png)

