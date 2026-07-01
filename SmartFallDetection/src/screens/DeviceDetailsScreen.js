import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Linking, Platform, ScrollView, Dimensions } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { BarChart } from 'react-native-chart-kit';

export default function DeviceDetailsScreen({ route }) {
  const { deviceId } = route.params;
  const [latestAlert, setLatestAlert] = useState(null);
  const [loading, setLoading] = useState(true);

  const [stepsData, setStepsData] = useState({ labels: ["-"], datasets: [{ data: [0] }] });
  const [activityData, setActivityData] = useState({ labels: ["-"], datasets: [{ data: [0] }] });
  const [hasTelemetry, setHasTelemetry] = useState(false);

  //Telemtry listener
  useEffect(() => {
    if (!deviceId) return;

    const q = query(
      collection(db, 'telemetry'),
      where('device_id', '==', deviceId),
      orderBy('date', 'desc'),
      limit(7)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setHasTelemetry(false);
        return;
      }

      const extrase = [];
      snapshot.forEach(doc => extrase.push(doc.data()));
      extrase.reverse();

      const eticheteZile = [];
      const valoriPasi = [];
      const valoriActivitate = [];

      extrase.forEach(data => {
        const ziLuna = data.date.split('-').slice(1, 3).reverse().join('/');
        eticheteZile.push(ziLuna);
        valoriPasi.push(data.steps || 0);
        valoriActivitate.push(data.activity_time_minutes || 0);
      });

      setStepsData({ labels: eticheteZile, datasets: [{ data: valoriPasi }] });
      setActivityData({ labels: eticheteZile, datasets: [{ data: valoriActivitate }] });
      setHasTelemetry(true);

    }, (error) => {
      console.log("Eroare extragere grafice:", error.message);
    });

    return () => unsubscribe();
  }, [deviceId]);

  useEffect(() => {
    const alertsRef = collection(db, 'alerts');
    const q = query(
      alertsRef,
      where('device_id', '==', deviceId),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setLatestAlert(snapshot.docs[0].data());
      }
      setLoading(false);
    }, (error) => {
      console.error("Eroare la citirea alertelor:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [deviceId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>Se încarcă datele hărții...</Text>
      </View>
    );
  }

  const dataFormatata = latestAlert?.timestamp 
    ? new Date(latestAlert.timestamp).toLocaleString('ro-RO') 
    : 'Nicio cădere detectată';

  const isEmergency = latestAlert?.isFall === true;

  const openNavigation = () => {
    if (!latestAlert) return;

    const lat = latestAlert.latitude;
    const lng = latestAlert.longitude;

    const url = Platform.select({
      // Pentru iOS deschidem Apple Maps cu destinația (daddr = destination address)
      ios: `http://maps.apple.com/?daddr=${lat},${lng}`,
      // Pentru Android deschidem direct Google Maps pe modul "Directions"
      android: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    });

    Linking.openURL(url).catch(err => 
      console.error("Nu am putut deschide aplicația de hărți: ", err)
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.infoBox}>
        <Text style={styles.title}>Stare Dispozitiv: {deviceId}</Text>
        <Text style={[styles.statusText, { color: isEmergency ? '#d9534f' : '#5cb85c' }]}>
          {latestAlert 
            ? (isEmergency ? `⚠️ Ultima cădere detectată la: \n${dataFormatata}` : `✅ Ultima locație sigură actualizată la: \n${dataFormatata}`) 
            : 'Sistemul nu are date GPS'}
        </Text>
      </View>

      {latestAlert ? (
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: latestAlert.latitude,
              longitude: latestAlert.longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }}
          >
            <Marker
              coordinate={{ latitude: latestAlert.latitude, longitude: latestAlert.longitude }}
              title={isEmergency ? "Locație Cădere Urgență" : "Ultima Locație Cunoscută"}
              description={isEmergency ? `Urgență: ${dataFormatata}` : `Actualizat: ${dataFormatata}`}
              pinColor={isEmergency ? "red" : "blue"}
            />
          </MapView>
          
          <TouchableOpacity 
            style={[styles.navigateButton, { backgroundColor: isEmergency ? '#d9534f' : '#007AFF' }]}
            onPress={openNavigation}
          >
            <Text style={styles.navigateButtonText}>
              {isEmergency ? "🚨 Navighează spre Urgență" : "🚗 Navighează către dispozitiv"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.noMapBox}>
          <Text style={styles.noMapText}>Nu există coordonate de afișat.</Text>
        </View>
      )}

      {hasTelemetry && (
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Pași în ultimele 7 zile</Text>
          <BarChart
            data={stepsData} 
            width={Dimensions.get("window").width - 30}
            height={220}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: "#ffffff",
              backgroundGradientFrom: "#ffffff",
              backgroundGradientTo: "#ffffff",
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`, 
              labelColor: (opacity = 1) => `rgba(100, 100, 100, ${opacity})`,
              style: { borderRadius: 16 },
              barPercentage: 0.7,
            }}
            style={{ marginVertical: 8, borderRadius: 16 }}
            showValuesOnTopOfBars={true}
          />
        </View>
      )}

      {hasTelemetry && (
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Minute de Activitate</Text>
          <BarChart
            data={activityData} 
            width={Dimensions.get("window").width - 30}
            height={220}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: "#ffffff",
              backgroundGradientFrom: "#ffffff",
              backgroundGradientTo: "#ffffff",
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(255, 149, 0, ${opacity})`, 
              labelColor: (opacity = 1) => `rgba(100, 100, 100, ${opacity})`,
              style: { borderRadius: 16 },
              barPercentage: 0.7,
            }}
            style={{ marginVertical: 8, borderRadius: 16 }}
            showValuesOnTopOfBars={true}
          />
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  infoBox: { padding: 20, backgroundColor: '#f8f9fa', borderBottomWidth: 1, borderColor: '#eee' },
  title: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  statusText: { fontSize: 15, marginTop: 8, fontWeight: 'bold' },
  noMapBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  noMapText: { textAlign: 'center', color: 'gray', fontSize: 16 },
  mapContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 20, 
  },
  map: {
    width: '100%',
    height: 400, 
    borderRadius: 15, 
  },
navigateButton: {
    width: '100%', 
    padding: 18,
    marginTop: 20, 
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  navigateButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollContainer: {
    flexGrow: 1, 
    paddingBottom: 40, 
    paddingHorizontal: 15, 
  },
  chartContainer: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 15,
    paddingVertical: 15,
    marginTop: 20,
    elevation: 3, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    alignSelf: 'flex-start',
    marginLeft: 15,
  },
});