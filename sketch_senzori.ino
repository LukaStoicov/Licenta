#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <TinyGPSPlus.h>

// --- Librării TensorFlow Lite ---
#include <TensorFlowLite_ESP32.h>
#include "tensorflow/lite/micro/all_ops_resolver.h"
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/schema/schema_generated.h"
#include "tensorflow/lite/micro/micro_error_reporter.h"
#include "model_data.h"

// --- SETARI RETEA & CONFIGURARE ---
#define RESET_BUTTON_PIN 0
#define RESET_TIME_MS 5000

#define GPS_RX_PIN 13
#define GPS_TX_PIN 14

#define SIM_RX_PIN 4
#define SIM_TX_PIN 5

#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHAR_UUID           "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// INLOCUIESTE CU DATELE TALE DE RETEA PENTRU TEST
const char* WIFI_SSID = "AndroidAP";
const char* WIFI_PASS = "cana2469";
const char* mqtt_server = "70bb9ae871a44c10a4ff4a50f3b4da99.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_user = "smartFallDetection";
const char* mqtt_pass = "Obradovici03!";

float last_lat = 0.0;
float last_lng = 0.0;

HardwareSerial GPS_Serial(1);
HardwareSerial SIM_Serial(2);
TinyGPSPlus gps;

unsigned long lastGpsUpdateTime = 0;
const unsigned long GPS_UPDATE_INTERVAL = 180000; // 3 minute (în milisecunde)
bool needGpsUpdate = false;

unsigned long lastPeriodicSend = 0;
const unsigned long PERIODIC_INTERVAL = 7200000; // 2 ore in milisecunde
unsigned long lastMidnightReset = 0;
const unsigned long DAY_IN_MILLIS = 86400000; // 24 de ore in milisecunde

Preferences preferences;
bool isConfigured = false;
bool deviceConnected = false;
unsigned long buttonPressStart = 0;

// Variabile BLE
bool dataReceived = false;
String macAddress = "";
String rawData = ""; 
String savedOwner = "";

WiFiClientSecure espClient;
PubSubClient client(espClient);
unsigned long lastAlertTime = 0;

// --- HARDWARE SENZOR & AI ---
Adafruit_MPU6050 mpu;
unsigned long previousMicros = 0;
const unsigned long intervalMicros = 5000; // 200Hz

// Pedometru & Activitate
RTC_DATA_ATTR uint32_t dailySteps = 0;
RTC_DATA_ATTR uint32_t activeMinutes = 0;
RTC_DATA_ATTR uint32_t activeMillisAccumulator = 0;
const float stepThreshold = 1.25;      
unsigned long lastStepTime = 0;
const int minStepInterval = 300;       

// Sleep-Software
bool isMoving = false;
unsigned long lastMotionTime = 0;
const unsigned long ACTIVE_TIMEOUT = 2000; 

// TensorFlow
tflite::AllOpsResolver tflOpsResolver;
tflite::ErrorReporter* error_reporter = nullptr;
const tflite::Model* tflModel = nullptr;
tflite::MicroInterpreter* tflInterpreter = nullptr;
TfLiteTensor* tflInputTensor = nullptr;
TfLiteTensor* tflOutputTensor = nullptr;

const int kArenaSize = 52 * 1024; 
uint8_t tensorArena[kArenaSize] __attribute__((aligned(16)));

class ButterworthFilter {
  private:
    float x[5] = {0,0,0,0,0}, y[5] = {0,0,0,0,0};
    const float b[5] = {1.329e-05, 5.317e-05, 7.975e-05, 5.317e-05, 1.329e-05};
    const float a[5] = {1.0, -3.671729, 5.067998, -3.115967, 0.719990};
  public:
    float filter(float v) {
      for (int i=4; i>0; i--) { x[i]=x[i-1]; y[i]=y[i-1]; }
      x[0]=v;
      y[0]=b[0]*x[0]+b[1]*x[1]+b[2]*x[2]+b[3]*x[3]+b[4]*x[4]-a[1]*y[1]-a[2]*y[2]-a[3]*y[3]-a[4]*y[4];
      return y[0];
    }
};

ButterworthFilter axesFilters[6];
float sensorBuffer[400][6];
int sampleCount = 0;

float mins[6] = { -5.696, -5.146, -5.538, -1172.63, -819.99, -737.59 };
float maxs[6] = {  5.223,  3.328,  5.449,  877.08,   701.90,  681.40 };


// --- FUNCTII DE RETEA ---
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  
  Serial0.print(">>> Conectare la WiFi: ");
  Serial0.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int tentative = 0;
  while (WiFi.status() != WL_CONNECTED && tentative < 20) {
    delay(500);
    Serial0.print(".");
    tentative++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial0.println("\n>>> WiFi Conectat!");
    espClient.setInsecure(); // Pentru MQTT SSL fara certificat
  } else {
    Serial0.println("\n>>> WiFi Esuat! Opresc antena.");
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
  }
}

void sendPeriodicDataMQTT() {
  connectWiFi();
  
  if (WiFi.status() == WL_CONNECTED) {
    if (!client.connected()) {
      Serial0.print(">>> Conectare la HiveMQ pentru date periodice...");
      String clientId = "ESP32Data-" + macAddress;
      if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
        Serial0.println("Conectat!");
      }
    }

    if (client.connected()) {
      int batteryLevel = getBatteryLevelFromAT();

      StaticJsonDocument<256> doc;
      doc["uid"] = savedOwner;
      doc["device_id"] = macAddress;
      doc["pasi"] = dailySteps;
      doc["minute_activitate"] = activeMinutes;
      doc["baterie"] = batteryLevel;
      
      char buffer[256];
      serializeJson(doc, buffer);
      String topic = "sensors/" + macAddress + "/data";
      
      Serial0.print("[MQTT] Trimit date periodice (pasi, act, bat) pe: "); Serial0.println(topic);
      client.publish(topic.c_str(), buffer);
      
      unsigned long waitStart = millis();
      while(millis() - waitStart < 1000) {
        client.loop(); 
        delay(10);
      }
    }
  }

  Serial0.println(">>> Opresc WiFi-ul pentru economie baterie.");
  client.disconnect();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

void sendAlertMQTT(float score) {
  // Pornim WiFi DOAR pentru a trimite alerta
  connectWiFi();
  
  if (WiFi.status() == WL_CONNECTED) {
    if (!client.connected()) {
      Serial0.print(">>> Conectare la HiveMQ...");
      String clientId = "ESP32Fall-" + macAddress;
      if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
        Serial0.println("Conectat!");
      }
    }

  if (client.connected()) {
      StaticJsonDocument<256> doc;
      doc["type"] = "FALL_DETECTED";
      doc["uid"] = savedOwner;
      doc["device_id"] = macAddress;
      doc["probability"] = score;
      doc["latitudine"] = last_lat;
      doc["longitudine"] = last_lng;
      
      char buffer[256];
      serializeJson(doc, buffer);
      String topic = "sensors/" + macAddress + "/fall";
      
      Serial0.print("Trimit alerta pe topic: "); Serial0.println(topic);
      client.publish(topic.c_str(), buffer);
      
      unsigned long waitStart = millis();
      while(millis() - waitStart < 1000) {
        client.loop(); 
        delay(10);
      }
    }
  }

  // Oprim WiFi imediat dupa trimitere pentru a salva bateria!
  Serial0.println(">>> Opresc WiFi-ul pentru economie baterie.");
  client.disconnect();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}


// --- CALLBACK-URI BLE ---
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial0.println(">>> BLE: Telefon CONECTAT!");
    };
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial0.println(">>> BLE: Telefon Deconectat.");
      pServer->getAdvertising()->start();
    }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String value = pCharacteristic->getValue().c_str();
      if (value.length() > 0) {
        rawData = value;
        dataReceived = true;
      }
    }
};

int getBatteryLevelFromAT() {
  int batteryPercentage = -1; // -1 va indica o eroare sau lipsa conexiunii
  Serial0.println("[BATERIE] Trimit comanda AT+CBC...");

  SIM_Serial.println("AT+CBC");

  unsigned long startTime = millis();
  const unsigned long TIMEOUT_MS = 1000;
  String response = "";

  while (millis() - startTime < TIMEOUT_MS) {
    if (SIM_Serial.available()) {
      char c = SIM_Serial.read();
      response += c;

      if (response.indexOf("\n") != -1) {
         // Cautam formatul tipic: +CBC: 0,85,4100
         int idx = response.indexOf("+CBC:");
         if (idx != -1) {
            int firstComma = response.indexOf(',', idx);
            int secondComma = response.indexOf(',', firstComma + 1);
            
            if (firstComma != -1 && secondComma != -1) {
              String percentageStr = response.substring(firstComma + 1, secondComma);
              batteryPercentage = percentageStr.toInt();
              
              Serial0.printf("[BATERIE] Nivel citit cu succes: %d%%\n", batteryPercentage);
              return batteryPercentage;
            }
         }
         // Resetam buffer-ul daca linia citita nu era ce cautam, pentru a prinde urmatoarea linie
         response = ""; 
      }
    }
  }

  // Daca ajungem aici, inseamna ca s-a scurs timpul (TIMEOUT) fara sa gasim +CBC
  Serial0.println("[BATERIE] AVERTISMENT: Timeout! Modulul nu a raspuns sau nu este conectat.");
  return batteryPercentage;
}

void checkFactoryReset() {
  // Dacă folosim BOOT (GPIO 0), acesta este LOW când e apăsat.
  bool isPressed = (digitalRead(RESET_BUTTON_PIN) == LOW);

  if (isPressed) {
    if (buttonPressStart == 0) {
      // 1. Primul moment în care detectăm apăsarea (Debounce inițial)
      delay(50);
      if (digitalRead(RESET_BUTTON_PIN) == LOW) {
        buttonPressStart = millis();
        Serial0.println("\n>>> BUTON APASAT: Tine 5 sec. pt Reset Bluetooth...");
      }
    } 
    else {
      // 2. Butonul este ținut apăsat. Verificăm cât timp a trecut.
      unsigned long pressedDuration = millis() - buttonPressStart;
      
      // Afișăm un punct la fiecare secundă ca feedback (fără să inundăm Serialul)
      static unsigned long lastPrint = 0;
      if (millis() - lastPrint > 1000) {
        Serial0.print(".");
        lastPrint = millis();
      }

      // 3. Au trecut cele 5 secunde! (RESET EFFECTIV)
      if (pressedDuration > RESET_TIME_MS) {
        Serial0.println("\n!!! FACTORY RESET: Stergere preferinte BLE !!!");
        
        preferences.begin("app_config", false);
        preferences.clear();
        preferences.end();
        
        Serial0.println("Memorie curatata! Repornire in 2 secunde...");
        delay(2000);
        ESP.restart(); // Repornește modulul, care va intra automat în MOD CONFIGURARE BLE
      }
    }
  } 
  else {
    // 4. Butonul a fost eliberat înainte de cele 5 secunde (sau nu e apăsat deloc)
    if (buttonPressStart != 0) {
      Serial0.println("\n>>> Buton eliberat prea devreme. Reset anulat.");
      buttonPressStart = 0;
    }
  }
}


void setup() {
  Serial0.begin(115200);
  pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);

  preferences.begin("app_config", true); 
  isConfigured = preferences.getBool("is_setup", false);
  savedOwner = preferences.getString("owner_uid", "N/A");
  macAddress = preferences.getString("device_id", "NECUNOSCUT");
  last_lat = preferences.getFloat("home_lat", 0.0);
  last_lng = preferences.getFloat("home_lng", 0.0);
  preferences.end();

  if (!isConfigured) {
      Serial0.println("=== MOD CONFIGURARE BLE ===");
      BLEDevice::init("ESP32_Fall_Monitor");
      BLEServer *pServer = BLEDevice::createServer();
      pServer->setCallbacks(new MyServerCallbacks());
      BLEService *pService = pServer->createService(SERVICE_UUID);
      BLECharacteristic *pCharacteristic = pService->createCharacteristic(
                                             CHAR_UUID,
                                             BLECharacteristic::PROPERTY_WRITE |
                                             BLECharacteristic::PROPERTY_WRITE_NR
                                           );
      pCharacteristic->setCallbacks(new MyCallbacks());
      pService->start();
      BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
      pAdvertising->addServiceUUID(SERVICE_UUID);
      BLEDevice::startAdvertising();
  } 
  else {
      Serial0.println("=== MOD MONITORIZARE ACTIVA ===");
      Serial0.print("Proprietar: "); Serial0.println(savedOwner);
      Serial0.print("ID Dispozitiv (MAC): "); Serial0.println(macAddress);
      Serial0.printf("Locatie Baza: Lat %.6f | Lng %.6f\n", last_lat, last_lng);
      
      WiFi.mode(WIFI_OFF);
      client.setServer(mqtt_server, mqtt_port);

      GPS_Serial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
      Serial0.println("Modul GPS inițializat pe Serial1.");

      // SIM_Serial.begin(115200, SERIAL_8N1, SIM_RX_PIN, SIM_TX_PIN);

      // Inițializare Hardware I2C (Senzor)
      Wire.begin(8, 9);
      Wire.setClock(400000); 
      if (!mpu.begin()) {
        Serial0.println("Eroare MPU6050!");
        while (1) yield();
      }
      mpu.setAccelerometerRange(MPU6050_RANGE_16_G);
      mpu.setGyroRange(MPU6050_RANGE_2000_DEG);
      mpu.setFilterBandwidth(MPU6050_BAND_184_HZ); 

      Serial0.println("[MPU6050] Aștept stabilizarea hardware a senzorului...");
      delay(500); // Oferim 500ms senzorului să își stabilizeze tensiunea internă

      // Citim și ignorăm primele 50 de eșantioane pentru a goli zgomotul de pornire
      sensors_event_t dummy_a, dummy_g, dummy_temp;
      for (int i = 0; i < 50; i++) {
        mpu.getEvent(&dummy_a, &dummy_g, &dummy_temp);
        delay(5);
      }
      
      isMoving = false;
      sampleCount = 0;
      previousMicros = micros(); 
      Serial0.println("[MPU6050] Senzor stabilizat și pregătit.");

      // Inițializare AI
      static tflite::MicroErrorReporter micro_error_reporter;
      error_reporter = &micro_error_reporter;
      tflModel = tflite::GetModel(model_tflite);
      static tflite::MicroInterpreter static_interpreter(
          tflModel, tflOpsResolver, tensorArena, kArenaSize, error_reporter);
      tflInterpreter = &static_interpreter;
      tflInterpreter->AllocateTensors();
      tflInputTensor = tflInterpreter->input(0);
      tflOutputTensor = tflInterpreter->output(0);
      
      Serial0.println("AI si Senzori pregatiti. Stand-by software activ.");

      // Sincronizam timer-ul ca sa trimita primul payload peste 2 ore
      lastPeriodicSend = millis();
      lastMidnightReset = millis();
  }
}

void loop() {
  checkFactoryReset();

  // --- MOD CONFIGURARE ---
  if (!isConfigured) {
      if (dataReceived) {
        dataReceived = false;
        StaticJsonDocument<512> doc;
        DeserializationError error = deserializeJson(doc, rawData);
        if (!error) {
          const char* uid = doc["uid"];
          const char* dev_id = doc["deviceId"];
          float incoming_lat = doc["lat"];
          float incoming_lng = doc["lng"];
          if (uid) {
              preferences.begin("app_config", false); 
              preferences.putString("owner_uid", uid);
              preferences.putString("device_id", dev_id);
              preferences.putFloat("home_lat", incoming_lat);
              preferences.putFloat("home_lng", incoming_lng);
              preferences.putBool("is_setup", true);
              preferences.end();
              Serial0.println("Configurat! Repornire...");
              delay(2000);
              ESP.restart();
          }
        }
      }
      delay(100);
      return; 
  }

  // --- 0. TRIMITE DATE PERIODIC (la 2 ore) ---
  if (millis() - lastPeriodicSend >= PERIODIC_INTERVAL) {
      sendPeriodicDataMQTT();
      lastPeriodicSend = millis();
  }

  if (millis() - lastMidnightReset >= DAY_IN_MILLIS) {
      Serial0.println(">>> [RESET INTERN] Au trecut 24 de ore de la ultima resetare/pornire. Curat datele zilnice!");
      dailySteps = 0;
      activeMinutes = 0;
      activeMillisAccumulator = 0;
      lastMidnightReset = millis();
  }

  // 1. Digerăm constant caracterele de la GPS
  while (GPS_Serial.available() > 0) {
    gps.encode(GPS_Serial.read());
  }

  // 2. Dacă suntem în mișcare și au trecut 3 minute, ridicăm steagul
  if (isMoving && (millis() - lastGpsUpdateTime >= GPS_UPDATE_INTERVAL)) {
    needGpsUpdate = true;
    Serial0.println("[GPS] Log: Initiez cautare locatie noua pentru ca utilizatorul se misca...");
  }

  // 3. Dacă avem nevoie de actualizare ȘI GPS-ul a prins o locație validă nouă
  if (needGpsUpdate && gps.location.isValid() && gps.location.isUpdated()) {
    last_lat = gps.location.lat();
    last_lng = gps.location.lng();
    lastGpsUpdateTime = millis();
    needGpsUpdate = false;
    
    Serial0.printf("[GPS] Locație actualizată: Lat %.6f | Lng %.6f\n", last_lat, last_lng);
  }

  // --- MOD MONITORIZARE CU SLEEP SOFTWARE ---
  unsigned long now = micros();
  if (now - previousMicros >= intervalMicros) { 
    previousMicros = now;

    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    float ax = a.acceleration.x / 9.80665; 
    float ay = a.acceleration.y / 9.80665;
    float az = a.acceleration.z / 9.80665;
    float gx = g.gyro.x * 57.2958;         
    float gy = g.gyro.y * 57.2958;
    float gz = g.gyro.z * 57.2958;

    float totalAcc = sqrt(ax * ax + ay * ay + az * az);

    // Pedometru
    if (totalAcc > stepThreshold && (millis() - lastStepTime > minStepInterval)) {
      dailySteps++;
      lastStepTime = millis();
      Serial0.printf("[PEDOMETRU] Log: Pas nou detectat. Total azi: %d\n", dailySteps);
    }

    // Detecție repaus (Baza = 0.93g, Prag = 0.20g)
    if (abs(totalAcc - 0.93) > 0.20) {
      if (!isMoving) isMoving = true;
      lastMotionTime = millis(); 
      activeMillisAccumulator += 5; 
      if (activeMillisAccumulator >= 60000) {
        activeMinutes++;
        activeMillisAccumulator = 0;
        Serial0.printf("[ACTIVITATE] Log: Inca un minut activ inregistrat. Total azi: %d minute\n", activeMinutes);
      }
    } 
    else if (isMoving && (millis() - lastMotionTime > ACTIVE_TIMEOUT)) {
      isMoving = false;
      sampleCount = 0; 
    }

    // Procesare AI (DOAR daca se misca)
    if (isMoving) {
      float converted[6] = {ax, ay, az, gx, gy, gz};
      
      for(int i=0; i<6; i++) {
        float filtered = axesFilters[i].filter(converted[i]);
        float val = (filtered - mins[i]) / (maxs[i] - mins[i]);
        float scaled = val * 2.0 - 1.0;
        sensorBuffer[sampleCount][i] = constrain(scaled, -1.0, 1.0);
      }

      sampleCount++;

      if (sampleCount >= 400) {
        int tensorIdx = 0;
        for (int i=0; i<400; i++) {
          for (int j=0; j<6; j++) {
            tflInputTensor->data.f[tensorIdx++] = sensorBuffer[i][j];
          }
        }

        if (tflInterpreter->Invoke() == kTfLiteOk) {
          float prediction = tflOutputTensor->data.f[0];

          if (prediction > 0.8) {
            Serial0.printf("!!! CADERE DETECTATA (Scor: %.2f) !!!\n", prediction);
            
            if (millis() - lastAlertTime > 10000) {
                sendAlertMQTT(prediction);
                lastAlertTime = millis();
            }
          }
        }

        for (int i = 0; i < 200; i++) {
          for (int j = 0; j < 6; j++) {
            sensorBuffer[i][j] = sensorBuffer[i + 200][j];
          }
        }
        sampleCount = 200; 
      }
    } 
  }
}