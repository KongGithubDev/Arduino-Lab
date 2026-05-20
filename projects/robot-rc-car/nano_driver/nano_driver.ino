#include <Wire.h>

// ========== PINS (Lotus Nano Bot) ==========
// Left Motor
#define ML1 9
#define ML2 4
#define MLPWM 5

// Right Motor
#define MR1 7
#define MR2 8
#define MRPWM 6

// ========== I2C VARIABLES ==========
volatile char cmdBuffer[16];
volatile bool newCmdReceived = false;

void setup() {
  // I2C Slave (Address 8)
  Wire.begin(8);
  Wire.onReceive(receiveEvent);

  // Motors
  pinMode(ML1, OUTPUT);
  pinMode(ML2, OUTPUT);
  pinMode(MR1, OUTPUT);
  pinMode(MR2, OUTPUT);
  pinMode(MLPWM, OUTPUT);
  pinMode(MRPWM, OUTPUT);
  stopCar();
}

void loop() {
  if (newCmdReceived) {
    processCommand(String((char *)cmdBuffer));
    newCmdReceived = false;
  }
}

void receiveEvent(int howMany) {
  int i = 0;
  while (Wire.available() && i < 15) {
    cmdBuffer[i++] = (char)Wire.read();
  }
  cmdBuffer[i] = '\0';
  newCmdReceived = true;
}

void processCommand(String cmd) {
  char action = cmd.charAt(0);
  switch (action) {
    case 'F': forward();  break;
    case 'B': back();     break;
    case 'L': left();     break;
    case 'R': right();    break;
    case 'S': stopCar();  break;
  }
}

// ========== MOTOR CONTROLS ==========
void stopCar() {
  analogWrite(MLPWM, 0);
  analogWrite(MRPWM, 0);
}

void forward() {
  digitalWrite(ML1, HIGH); digitalWrite(ML2, LOW);
  digitalWrite(MR1, HIGH); digitalWrite(MR2, LOW);
  analogWrite(MLPWM, 255);
  analogWrite(MRPWM, 255);
}

void back() {
  digitalWrite(ML1, LOW); digitalWrite(ML2, HIGH);
  digitalWrite(MR1, LOW); digitalWrite(MR2, HIGH);
  analogWrite(MLPWM, 255);
  analogWrite(MRPWM, 255);
}

void left() {
  digitalWrite(ML1, LOW);  digitalWrite(ML2, HIGH);
  digitalWrite(MR1, HIGH); digitalWrite(MR2, LOW);
  analogWrite(MLPWM, 255);
  analogWrite(MRPWM, 255);
}

void right() {
  digitalWrite(ML1, HIGH); digitalWrite(ML2, LOW);
  digitalWrite(MR1, LOW);  digitalWrite(MR2, HIGH);
  analogWrite(MLPWM, 255);
  analogWrite(MRPWM, 255);
}
