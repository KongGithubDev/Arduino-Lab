# ชีตสรุป Lotus Nano Bot (พิมพ์แจกนักเรียน)

## หัวต่อบนบอร์ด

`A0 A1 A2 A3 A4 A5` · `A6 D0 D1 D3` · `ML MR` · `SV1 SV2 SV3` · `AA0 AA1 AA2 AA3`

แต่ละพอร์ต: **ช่องขาว = S (สัญญาณ)** · **ช่องแดง = 5V** · **ช่องดำ = GND**

## พอร์ตที่ใช้ได้ / ห้ามใช้

| พอร์ต | สถานะ | หมายเหตุ |
|------|------|---------|
| D0, D1 | ⚠️ ระวัง | Serial / Bluetooth ถ้าใช้ Serial Monitor ห้ามต่ออุปกรณ์ |
| D2 | 🔒 บนบอร์ด | ปุ่ม OK (อ่านค่าได้ ห้ามต่อเซนเซอร์ซ้ำ) |
| D3 | ✅ ภายนอก | ต่อร่วมกับ Buzzer บนบอร์ด (เป็น Output จะมีเสียง) PWM ได้ |
| D4, D5, D9 | 🔒 บนบอร์ด | มอเตอร์ซ้าย |
| D6, D7, D8 | 🔒 บนบอร์ด | มอเตอร์ขวา |
| D10, D11, D12 | 🔒/✅ | หัวต่อ Servo SV1-SV3 (ไม่ใช้เซอร์โวก็ต่อ Digital ได้, D10/D11 เป็น PWM) |
| D13 | ✅ | LED บนบอร์ด Nano (ใช้เป็น LED_PIN ได้) |
| A0 - A3 | ✅ ภายนอก | Analog หรือ Digital (14, 15, 16, 17) |
| A4, A5 | 🔒 I2C | OLED, Compass, ADS1115 |
| A6 | ✅ ภายนอก | **Analog อย่างเดียว** (ห้าม digitalRead / pinMode) |
| A7 | 🔒 บนบอร์ด | Knob (Potentiometer) |

## คำสั่งที่ใช้บ่อย

```cpp
pinMode(pin, INPUT);          // ขาเป็นอินพุต
pinMode(pin, INPUT_PULLUP);   // อินพุต + ตัวต้านทาน Pull-up ภายใน (กด = LOW)
pinMode(pin, OUTPUT);         // ขาเป็นเอาต์พุต

int d = digitalRead(pin);     // อ่านค่า 0 หรือ 1
int a = analogRead(A0);       // อ่านค่า 0 - 1023 (0 - 5V)
digitalWrite(pin, HIGH);      // จ่ายไฟ 5V
analogWrite(10, 128);         // PWM 0 - 255 (บนหัวต่อ: D10/D11 ที่ SV1/SV2 และ D3 ที่ใช้ร่วมกับบัซเซอร์)

tone(3, 1000, 200);           // เสียง 1000 Hz นาน 200 ms ที่บัซเซอร์บนบอร์ด
noTone(3);

int v = map(a, 0, 1023, 0, 100);   // แปลงช่วงค่า
Serial.begin(9600);  Serial.println(a);
delay(100);  unsigned long t = millis();
```

## สูตรที่ใช้บ่อย

- แรงดันจาก ADC: `V = analogRead(pin) * 5.0 / 1023.0`
- ความละเอียด ADC 10 บิต: 5V / 1024 ≈ 4.9 mV ต่อหน่วย
- Duty Cycle PWM: `duty% = value / 255 * 100`

## เช็กลิสต์ก่อนอัปโหลด

- [ ] Tools > Board = **Arduino Nano**
- [ ] Processor = ATmega328P (ถ้าอัปโหลดไม่ได้ ลอง **Old Bootloader**)
- [ ] เลือก Port ถูกต้อง
- [ ] ถอด Bluetooth ออก (ถ้าต่อไว้ที่ D0/D1)
- [ ] ไม่มีขาชนกับอุปกรณ์บนบอร์ด
- [ ] GND ของเซนเซอร์ต่อร่วมกับบอร์ด
