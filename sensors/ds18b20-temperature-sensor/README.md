# KY-001 --- DS18B20 Temperature Sensor

## รายละเอียด

DS18B20 เป็นเซนเซอร์วัดอุณหภูมิดิจิตอลแบบ One-Wire จาก Maxim Integrated มีความแม่นยำสูง (±0.5°C) และสามารถต่อหลายตัวบนสายเดียวกันได้ (One-Wire Bus)

## คุณสมบัติ

- แรงดันไฟฟ้า: 3.0V - 5.5V DC
- ช่วงวัดอุณหภูมิ: -55°C ถึง +125°C
- ความแม่นยำ: ±0.5°C (ที่ -10°C ถึง +85°C)
- ความละเอียด: 9-12 bit (ปรับได้)
- สื่อสารแบบ 1-Wire Protocol

## ขาของเซนเซอร์

| ขา (Sensor) | สีสาย | เชื่อมต่อกับ (Lotus Nano Bot) |
|-------------|-------|------------------------------|
| VDD (VCC)   | แดง   | 5V                           |
| GND         | ดำ   | GND                           |
| DQ (Data)   | เหลือง | A0 (D14), A1-A3 หรือ D3      |

> **สำคัญ:** ต้องต่อตัวต้านทาน Pull-up 4.7KΩ ระหว่าง DQ และ VDD (โมดูล KY-001 ส่วนใหญ่มีตัวต้านทานนี้บนแผงแล้ว)
>
> **หมายเหตุ:** D4 ถูกใช้โดยมอเตอร์ซ้ายของ Lotus Nano Bot จึงใช้ A0 (D14) แทน หลีกเลี่ยง D3 เพราะ Pull-up จะดึงขาบัซเซอร์ไว้ที่ HIGH

## การต่อสายไฟ

```
DS18B20                  Lotus Nano Bot
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VDD  ──────────────────► 5V
GND  ──────────────────► GND
DQ   ──────────────────► A0 (D14)

(ต่อตัวต้านทาน 4.7KΩ ระหว่าง DQ และ VDD)
```

### ภาพการต่อสาย (Text Diagram)

```
              +------------------+
              |    DS18B20       |
              |  Temperature     |
              |    Sensor        |
              |                  |
         +----+----+   +----+----+   +----+----+
         |  VDD    |   |  DQ     |   |  GND    |
         |   (+)   |   | (Data)  |   |   (-)   |
         +----+----+   +----+----+   +----+----+
              |             |             |
              |             |             |
         +----+----+   +----+----+   +----+----+
         |   5V    |   |   A0    |   |  GND    |
         |         |   |  (D14)  |   |         |
         |  Lotus  |   |  Nano   |   |  Bot    |
         +---------+   +----+----+   +---------+
                            |
                         [4.7KΩ]
                            |
                       +----+----+
                       |   5V    |
                       +---------+
```

## โค้ดตัวอย่าง

```cpp
// DS18B20 Temperature Sensor Example
// สำหรับ Lotus Nano Bot
// DQ -> A0 (D14) (ใช้ไลบรารี OneWire และ DallasTemperature)

#include <OneWire.h>
#include <DallasTemperature.h>

#define ONE_WIRE_BUS A0  // = 14

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

void setup() {
  Serial.begin(9600);
  sensors.begin();
  Serial.println("DS18B20 Temperature Sensor Test Started");
}

void loop() {
  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);
  
  if (tempC == DEVICE_DISCONNECTED_C) {
    Serial.println("❌ Sensor disconnected!");
  } else {
    Serial.print("🌡️  Temperature: ");
    Serial.print(tempC);
    Serial.println(" °C");
    
    float tempF = DallasTemperature::toFahrenheit(tempC);  // ไม่ต้องอ่านจากบัสซ้ำ
    Serial.print("🌡️  Temperature: ");
    Serial.print(tempF);
    Serial.println(" °F");
  }
  
  delay(1000);
}
```

## โค้ดตัวอย่างหลายเซนเซอร์บน One-Wire Bus

```cpp
#include <OneWire.h>
#include <DallasTemperature.h>

#define ONE_WIRE_BUS A0  // = 14

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

void setup() {
  Serial.begin(9600);
  sensors.begin();
  
  Serial.print("Found ");
  Serial.print(sensors.getDeviceCount());
  Serial.println(" sensor(s).");
}

void loop() {
  sensors.requestTemperatures();
  
  for (int i = 0; i < sensors.getDeviceCount(); i++) {
    float temp = sensors.getTempCByIndex(i);
    Serial.print("Sensor ");
    Serial.print(i);
    Serial.print(": ");
    Serial.print(temp);
    Serial.println(" °C");
  }
  
  Serial.println("---");
  delay(1000);
}
```

## วิธีติดตั้งไลบรารี

1. เปิด Arduino IDE
2. ไปที่ **Sketch > Include Library > Manage Libraries...**
3. ติดตั้ง **OneWire** โดย Paul Stoffregen
4. ติดตั้ง **DallasTemperature** โดย Miles Burton

## หมายเหตุ

- อย่าลืมต่อตัวต้านทาน Pull-up 4.7KΩ บน One-Wire Bus
- สามารถต่อหลายตัวได้บนสายเดียวกัน (Parasitic Mode ก็ทำได้โดยต่อขา VDD ของเซนเซอร์ลง GND และจ่ายไฟผ่านสาย DQ)
- แต่ละ DS18B20 มี Address ที่ไม่ซ้ำกัน (64-bit ROM)
- เวลาอ่านค่าขึ้นอยู่กับความละเอียดที่ตั้งไว้ (9-bit = 93ms, 12-bit = 750ms)

## กิจกรรมการเรียนรู้

### จุดประสงค์การเรียนรู้
1. อธิบายหลักการสื่อสารแบบ 1-Wire และหน้าที่ของตัวต้านทาน Pull-up ได้
2. ติดตั้งไลบรารี ต่อวงจร DS18B20 เข้ากับ A0 และอ่านอุณหภูมิเป็น °C และ °F ได้
3. วัดอุณหภูมิของน้ำที่อุณหภูมิต่างกันและเปรียบเทียบกับเทอร์โมมิเตอร์อ้างอิงได้

### ขั้นตอนการทดลอง
1. ติดตั้งไลบรารี OneWire และ DallasTemperature ต่อสาย VDD → 5V, GND → GND, DQ → A0 (พร้อม Pull-up 4.7KΩ ถ้าโมดูลไม่มี)
2. อัปโหลดโค้ดตัวอย่างแรก เปิด Serial Monitor บันทึกอุณหภูมิห้อง
3. ใช้นิ้วจับเซนเซอร์ แล้ววัดเวลาที่ค่าเพิ่มขึ้น 2°C
4. (ใช้รุ่นหัวกันน้ำ) จุ่มลงในน้ำเย็นและน้ำอุ่น รอค่านิ่งแล้วบันทึกเทียบกับเทอร์โมมิเตอร์

### ตารางบันทึกผล
| ครั้งที่ | สภาวะ/การกระทำ | ค่าที่อ่านได้ | ผลที่สังเกตได้ |
|---|---|---|---|
| 1 | อุณหภูมิห้อง | | |
| 2 | จับเซนเซอร์ด้วยนิ้ว 30 วินาที | | |
| 3 | จุ่มในน้ำเย็น (หรืออุ่น) รอค่านิ่ง | | |

### คำถามท้ายการทดลอง
1. ถ้าไม่ต่อตัวต้านทาน Pull-up จะเกิดอะไรขึ้นกับการอ่านค่า เพราะเหตุใด
2. ค่าที่อ่านได้จาก DS18B20 ต่างจากเทอร์โมมิเตอร์อ้างอิงเท่าใด อยู่ในช่วง ±0.5°C หรือไม่
3. ถ้าต้องการวัดอุณหภูมิ 3 จุดในตู้ปลาโดยใช้ขาเดียว จะทำอย่างไร

<details>
<summary>แนวคำตอบ (สำหรับครู)</summary>

1. อ่านค่าไม่ได้หรือได้ -127°C (DEVICE_DISCONNECTED_C) เพราะบัส 1-Wire เป็นแบบ Open-drain ต้องมี Pull-up ดึงสายให้เป็น HIGH ขณะไม่มีอุปกรณ์ดึงลง
2. ขึ้นกับผลการทดลอง ปกติควรต่างไม่เกิน ±0.5°C ในช่วง -10°C ถึง +85°C ถ้าต่างมากอาจเพราะรอค่าไม่นิ่ง
3. ต่อ DS18B20 ทั้ง 3 ตัวขนานบนสาย DQ เดียวกัน ใช้ Pull-up ตัวเดียว แล้วอ่านด้วย getTempCByIndex(i) หรืออ้างอิงจาก Address 64-bit ของแต่ละตัว (โค้ดหลายเซนเซอร์ด้านบน)

</details>

### ภารกิจท้าทาย
- แสดงอุณหภูมิบนจอ OLED และใช้เซอร์โว D10 เป็น "เข็มเทอร์โมมิเตอร์" หมุน 0-180° ตามช่วง 20-40°C พร้อมกดปุ่ม D2 เพื่อสลับหน่วยระหว่าง °C และ °F

## รูปภาพ

![ds18b20-temperature-sensor](../../assets/images/ds18b20-temperature-sensor.jpg)

![ds18b20-temperature-sensor-wiring](../../assets/diagrams/ds18b20-temperature-sensor-wiring.png)

