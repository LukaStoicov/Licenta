import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Linking, Platform, ScrollView, Dimensions, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
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
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Se încarcă datele hărții...</Text>
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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.infoBox}>
          <View style={styles.titleRow}>
            <Ionicons name="hardware-chip-outline" size={18} color="#2563EB" />
            <Text style={styles.title} numberOfLines={1}>Stare Dispozitiv: {deviceId}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: isEmergency ? '#FEF2F2' : '#ECFDF5' }]}>
            <Ionicons
              name={isEmergency ? 'warning' : 'checkmark-circle'}
              size={16}
              color={isEmergency ? '#EF4444' : '#059669'}
              style={{ marginRight: 6, marginTop: 1 }}
            />
            <Text style={[styles.statusText, { color: isEmergency ? '#EF4444' : '#059669' }]}>
              {latestAlert 
                ? (isEmergency ? `Ultima cădere detectată la:\n${dataFormatata}` : `Ultima locație sigură actualizată la:\n${dataFormatata}`) 
                : 'Sistemul nu are date GPS'}
            </Text>
          </View>
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
              style={[styles.navigateButton, { backgroundColor: isEmergency ? '#EF4444' : '#2563EB' }]}
              onPress={openNavigation}
              activeOpacity={0.85}
            >
              <Ionicons
                name={isEmergency ? 'alert-circle' : 'navigate'}
                size={20}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.navigateButtonText}>
                {isEmergency ? "Navighează spre Urgență" : "Navighează către dispozitiv"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.noMapBox}>
            <Ionicons name="location-outline" size={40} color="#94A3B8" />
            <Text style={styles.noMapText}>Nu există coordonate de afișat.</Text>
          </View>
        )}

        {hasTelemetry && (
          <View style={styles.chartContainer}>
            <View style={styles.chartHeader}>
              <Ionicons name="footsteps-outline" size={18} color="#2563EB" />
              <Text style={styles.chartTitle}>Pași în ultimele 7 zile</Text>
            </View>
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
                color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`, 
                labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
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
            <View style={styles.chartHeader}>
              <Ionicons name="time-outline" size={18} color="#10B981" />
              <Text style={styles.chartTitle}>Minute de Activitate</Text>
            </View>
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
                color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`, 
                labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
                style: { borderRadius: 16 },
                barPercentage: 0.7,
              }}
              style={{ marginVertical: 8, borderRadius: 16 }}
              showValuesOnTopOfBars={true}
            />
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },

  infoBox: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginTop: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 8,
    flex: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    lineHeight: 19,
  },
  noMapBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderStyle: 'dashed',
  },
  noMapText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 8,
  },
  mapContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 16,
  },
  map: {
    width: '100%',
    height: 240,
    borderRadius: 16,
  },
  navigateButton: {
    flexDirection: 'row',
    width: '100%',
    padding: 15,
    marginTop: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  navigateButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 40,
    paddingHorizontal: 15,
  },
  chartContainer: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 15,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: 15,
    marginBottom: 10,
    gap: 8,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 6,
  },
});