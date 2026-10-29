# Gate hardware prototype notes

The software in this folder is a **bench-only actuator example**, not a deployable college gate security system. The backend verifies approval state and pass time, but the sample does not enroll or match faces, test liveness, authenticate a camera, or establish that a scan belongs to the student. Do not connect this sample to an occupied gate.

## Bench setup

Example controller: ESP32 DevKit, 16x2 I2C LCD (address `0x27`), and a small servo with no mechanical gate attached.

| Part | ESP32 connection |
|---|---|
| LCD SDA | GPIO 21 |
| LCD SCL | GPIO 22 |
| Servo signal | GPIO 18 |
| Servo positive | Separate regulated supply sized for the servo |
| Servo ground | Supply ground and ESP32 ground connected together |

Do not power a servo from the ESP32 3.3 V pin. Use a suitable external supply, verify the servo's logic level requirements, test without a gate load, and provide a physical manual release. Pin numbers, closed angle, open angle, and gate-open interval must be selected and safety-tested for the specific installation.

## Firmware

`esp32/StudentGatewayController.ino` receives a request ID and event type through its serial console, asks the backend for authorization, and opens the bench servo only when the backend responds with HTTP 200 and `decision=granted`. The current backend deliberately returns HTTP 503 for real-device requests because identity verification is not implemented. As a result, this firmware will remain closed until a trusted identity integration is implemented and reviewed; that fail-closed behavior is intentional. It returns to the configured closed position after 60 seconds if access is ever enabled.

Configure Wi-Fi, API address, device token, and device ID in the sketch before compiling. Do not commit real credentials. Enter one line as `request-id|departure` or `request-id|return`. The serial request ID is a development input and is not proof of identity. A production system needs a reviewed identity-verification component and authenticated, replay-resistant device communication before the gate endpoint can be trusted.

Install the ESP32 board support and Arduino libraries `ESP32Servo`, `LiquidCrystal_I2C`, and `ArduinoJson` in Arduino IDE. Start the API on a host reachable from the ESP32; `localhost` on the microcontroller is not the development computer. A plain HTTP API is suitable only on an isolated bench network—use a secure authenticated channel and device credential lifecycle for any approved deployment.
