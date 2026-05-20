# โปรเจกต์: รถบังคับ Lotus Nano Bot (RC Car)

รถบังคับผ่านเว็บ โดยใช้ **ESP32** คุมผ่าน WiFi และ **Lotus Nano Bot** (Arduino Nano + Lotus Nano Shield) ขับมอเตอร์

---

## สถาปัตยกรรม

```
+------------------+        I2C         +-----------------------------+
|      ESP32       |<------------------>|   Lotus Nano Bot (Slave 8) |
|   (Web Server)   |   SDA=21, SCL=22   |  - มอเตอร์ซ้าย (D9/D4/D5)   |
|   - D-Pad UI     |                    |  - มอเตอร์ขวา (D7/D8/D6)   |
|   - WiFi         |                    |  - รับคำสั่งผ่าน I2C        |
+------------------+                    +-----------------------------+
```

---

## การต่อสาย (ESP32 -> Nano)

| ESP32 | Lotus Nano | สาย |
|-------|-----------|-----|
| GPIO 21 | A4 (SDA) | ขาว |
| GPIO 22 | A5 (SCL) | เหลือง |
| GND | GND | ดำ |
| 5V | 5V | แดง |

---

## คำสั่งควบคุม (I2C)

| คำสั่ง | ทิศทาง |
|--------|--------|
| `F` | เดินหน้า |
| `B` | ถอยหลัง |
| `L` | เลี้ยวซ้าย |
| `R` | เลี้ยวขวา |
| `S` | หยุด |

---

## ไฟล์โค้ด

| ไฟล์ | บอร์ด |
|------|-------|
| `nano_driver/nano_driver.ino` | Lotus Nano Bot |
| `esp32_controller/esp32_controller.ino` | ESP32 |

---

## วิธีใช้งาน

1. อัปโหลด `nano_driver.ino` ไปยัง Lotus Nano Bot
2. แก้ไข `ssid` และ `password` ใน `esp32_controller.ino`
3. อัปโหลด `esp32_controller.ino` ไปยัง ESP32
4. เปิด Serial Monitor ของ ESP32 ดู IP Address
5. เปิด Browser ที่มือถือ/คอม แล้วเข้า IP นั้น
6. ใช้ D-Pad บนหน้าเว็บบังคับรถ

---
