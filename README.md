# SmartFallDetection

Repository: [https://github.com/LukaStoicov/Licenta](https://github.com/LukaStoicov/Licenta)

## Sumar

**SmartFallDetection** este un sistem complet de detecție a căderilor, gândit în special pentru persoane vârstnice sau utilizatori cu risc, care combină un dispozitiv purtabil (brățară) bazat pe **ESP32** cu o infrastructură cloud și o aplicație mobilă.

Sistemul este format din trei componente principale:

1. **Firmware ESP32 (`sketch_senzori.ino` + `model_data.h`)** — citește datele de la accelerometru (MPU6050) la 200 Hz, rulează local un model **TensorFlow Lite Micro** pentru detecția căderilor, obține poziția GPS și trimite datele/alertele prin MQTT (TLS) către brokerul HiveMQ Cloud. Suportă și configurare inițială prin BLE (asociere cu contul utilizatorului) și un pedometru integrat.
2. **Backend Node.js (`Backend/index.js`)** — se abonează la topicele MQTT (`sensors/+/fall` și `sensors/+/data`), salvează alertele și telemetria zilnică în **Firebase Firestore** și trimite notificări push prin **Firebase Cloud Messaging** către telefonul proprietarului brățării.
3. **Aplicație mobilă (`SmartFallDetection/`)** — aplicație React Native / Expo care permite autentificarea, asocierea brățării prin BLE, vizualizarea locației pe hartă la o alertă de cădere, statistici de activitate și alerte în timp real (cădere / baterie descărcată).

Fluxul complet: dispozitivul detectează o cădere → publică pe MQTT → backend-ul primește mesajul, salvează alerta în Firestore și trimite push notification → aplicația mobilă afișează alerta și deschide harta cu ultima locație GPS.

## Componente hardware necesare

Pentru replicarea proiectului este **obligatoriu** un dispozitiv fizic construit din următoarele componente (trebuie să coincidă cu pinout-ul definit în `sketch_senzori.ino`):

| Componentă | Rol | Observații |
|------------|-----|-----------|
| **ESP32 DevKit** (WROOM-32) | MCU principal, WiFi + BLE | Cu suport TensorFlow Lite Micro (`TensorFlowLite_ESP32`) |
| **MPU6050** | Accelerometru + giroscop (I²C) | Sursă de date pentru modelul de detecție a căderilor |
| **Modul GPS** (NEO-6M / NEO-8M) | Poziționare | Conectat pe `GPS_RX_PIN = 13`, `GPS_TX_PIN = 14` (UART1) |
| Buton reset configurare | Ștergere date salvate (WiFi/asociere) | Pe `GPIO 0`, apăsare lungă ≥ 5 s |
| Sursă de alimentare (LiPo + modul de încărcare) | Autonomie dispozitiv | — |

> Pinii sunt definiți în partea de sus a fișierului `sketch_senzori.ino`. Dacă folosești alte GPIO-uri, actualizează `#define`-urile corespunzător.

## Pornirea aplicației

### 1. Firmware ESP32

Deschide `sketch_senzori.ino` în **Arduino IDE**, verifică credențialele WiFi / MQTT din partea de sus a fișierului și apasă **Upload** pe placa ESP32.

### 2. Backend (logare pe brokerul HiveMQ)

```bash
cd Backend
npm install
node index.js
```

În consolă trebuie să apară `Backend-ul rulează! Așteptăm alerte de la ESP32...` — din acest moment backend-ul este conectat la brokerul HiveMQ.

### 3. Aplicație mobilă

```bash
cd SmartFallDetection
npm install
npx expo run:android
```

Sau, dacă ai deja un development build instalat pe telefon:

```bash
npx expo start --dev-client
```
