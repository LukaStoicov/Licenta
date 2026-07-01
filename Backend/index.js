require('dotenv').config();

const mqtt = require('mqtt');
const admin = require('firebase-admin');

const serviceAccount = require('./firebase-key.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const client = mqtt.connect('mqtts://70bb9ae871a44c10a4ff4a50f3b4da99.s1.eu.hivemq.cloud:8883', {
  username: process.env.HIVEMQ_USERNAME,
  password: process.env.HIVEMQ_PASSWORD
});

client.on('connect', () => {
  console.log('Backend-ul rulează! Așteptăm alerte de la ESP32...');
  client.subscribe('sensors/+/fall');
  client.subscribe('sensors/+/data');
});

client.on('message', async (topic, message) => {
  console.log(`\nMesaj nou primit pe topicul: ${topic}`);
  
  try {
    const payload = JSON.parse(message.toString());
    const macDevice = payload.device_id;

    if (!macDevice) {
      console.log('Mesajul ignorat: Nu conține device_id.');
      return;
    }

    console.log(`Căutăm proprietarul brățării ${macDevice}...`);

    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('my_devices', 'array-contains', macDevice).get();

    if (snapshot.empty) {
      console.log(`Nu am găsit niciun utilizator care să dețină brățara ${macDevice}.`);
      return;
    }

    snapshot.forEach(async (doc) => {
      const userData = doc.data();
      const tokenFCM = userData.fcmToken;
      const userId = doc.id;

      // CAZUL 1: ALERTA DE CADERE
      if (topic.endsWith('fall')) {
        console.log(`⚠️ ALERTĂ DETECTATĂ pentru ${userData.name || 'Utilizator'}. Salvăm locația...`);

        try {
          await db.collection('alerts').add({
            device_id: macDevice,
            userId: userId,
            latitude: payload.latitudine,
            longitude: payload.longitudine,
            timestamp: new Date().toISOString(),
            isFall: true
          });
          console.log(`Coordonatele hărții au fost salvate cu succes în Firestore în 'alerts'.`);
        } catch (dbError) {
          console.error("Eroare la salvarea alertei în Firestore:", dbError.message);
        }

        if (!tokenFCM) {
          console.log(`Utilizatorul ${userData.name} nu are FCM Token salvat. Notificarea nu s-a trimis.`);
          return;
        }

        const mesajPush = {
          token: tokenFCM,
          notification: {
            title: 'ALERTĂ DE CĂDERE',
            body: `S-a înregistrat o urgență! Apasă aici pentru a vedea locația pe hartă.`
          },
          data: {
            declanseaza_alerta: "da",
            device_id: macDevice 
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'alerta-maxima',
              sound: 'default'
            }
          }
        };

        const response = await admin.messaging().send(mesajPush);
        console.log('Notificare de cădere trimisă cu succes! ID Firebase:', response);
      } 
      
      // CAZUL 2: DATE SENZORI (TELEMETRIE)
      else if (topic.endsWith('data'))
      {
        console.log(`Date senzori primite pentru ${userData.name || 'Utilizator'}.`);

        const astazi = new Date().toISOString().split('T')[0];
        const docIdZilnic = `${macDevice}_${astazi}`; 

        try {
          await db.collection('telemetry').doc(docIdZilnic).set({
            device_id: macDevice,
            userId: userId,
            date: astazi,
            battery_level: payload.baterie || 100,
            steps: payload.pasi || 0,
            activity_time_minutes: payload.timp_activitate || 0,
            last_update: new Date().toISOString()
          }, { merge: true });

          console.log(`Telemetria zilei (${astazi}) a fost actualizată în Firestore.`);
        } catch (error) {
          console.error("Eroare la salvarea telemetriei:", error.message);
        }

        // VERIFICARE INTELIGENTA BATERIE
        if (payload.baterie && payload.baterie <= 15) {
          console.log(`Baterie critică (${payload.baterie}%). Trimitem alertă!`);
          
          if (tokenFCM) {
            const mesajBaterie = {
              token: tokenFCM,
              notification: {
                title: 'Baterie Descărcată',
                body: `Brățara ta a ajuns la ${payload.baterie}%. Te rugăm să o pui la încărcat.`
              },
              data: { tip: "baterie", device_id: macDevice },
              android: { priority: 'high', notification: { channelId: 'alerta-maxima', sound: 'default' } }
            };
            await admin.messaging().send(mesajBaterie);
            console.log('Notificare baterie trimisă!');
          }
        }
      }
      
      else {
        console.log(`Topic nespecificat în reguli: ${topic}`);
      }
    });

  } catch (error) {
    console.log('Eroare la procesarea mesajului:', error.message);
  }
});