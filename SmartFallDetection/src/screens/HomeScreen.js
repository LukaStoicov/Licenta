import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView} from 'react-native';
import { signOut } from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { auth, db } from '../config/firebase';
import { Platform } from 'react-native';


export default function HomeScreen({ navigation }) {
  
  useEffect(() => {
    async function setupNotifications() {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        
        if (finalStatus !== 'granted') {
          console.log('Permisiune refuzată pentru notificări.');
          return;
        }

        const tokenData = await Notifications.getDevicePushTokenAsync();
        const tokenFCM = tokenData.data;
        console.log("Token obținut cu succes:", tokenFCM);

        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
          fcmToken: tokenFCM,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        
      } catch (error) {
        console.error("Eroare la setarea notificărilor:", error);
      }

      if (Platform.OS === 'android')
      {
        await Notifications.setNotificationChannelAsync('alerta-maxima', 
          {
            name: 'Alerte Urgență',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 500, 500],
            lightColor: '#FF0000',
          });
      }
    }

    setupNotifications();
    
  }, []);

  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        setUserData(snapshot.data());
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    signOut(auth).catch(error => console.log('Error logging out: ', error));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.welcomeText}>Salut! Ești conectat.</Text>
      <Text style={styles.emailText}>{auth.currentUser?.email}</Text>

      <Text style={styles.sectionTitle}>Dispozitivele mele:</Text>
      <ScrollView style={styles.devicesList} contentContainerStyle={{ alignItems: 'center' }}>
        {userData?.my_devices && userData.my_devices.length > 0 ? (
          userData.my_devices.map((macAddress, index) => (
            <TouchableOpacity 
              key={index}
              style={styles.deviceCard}
              onPress={() => navigation.navigate('DeviceDetails', { deviceId: macAddress })}
            >
              <Text style={styles.deviceText}>Brățară SmartFall</Text>
              <Text style={styles.macText}>MAC: {macAddress}</Text>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.noDevices}>Nu ai niciun dispozitiv configurat.</Text>
        )}
      </ScrollView>

      <TouchableOpacity 
        style={styles.profileButton} 
        onPress={() => navigation.navigate('Profile')}
      >
        <Text style={styles.btnText}>Configurează Contul</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.btnText}>Deconectare</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  welcomeText: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  emailText: { fontSize: 16, color: 'gray', marginBottom: 40 },
  profileButton: { backgroundColor: '#34C759', padding: 15, borderRadius: 10, width: '80%', alignItems: 'center', marginBottom: 10 },
  logoutButton: { backgroundColor: '#FF3B30', padding: 15, borderRadius: 10, width: '80%', alignItems: 'center' },
  btnText: { color: 'white', fontWeight: 'bold' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', alignSelf: 'flex-start', marginLeft: '10%', marginBottom: 10, marginTop: 20 },
  devicesList: { width: '100%', maxHeight: 200, marginBottom: 20 },
  deviceCard: { backgroundColor: '#E6F4FE', padding: 15, borderRadius: 10, width: '80%', marginBottom: 10, borderWidth: 1, borderColor: '#B4DBFA' },
  deviceText: { fontSize: 16, fontWeight: 'bold', color: '#007AFF' },
  macText: { fontSize: 12, color: 'gray', marginTop: 5 },
  noDevices: { color: 'gray', fontStyle: 'italic' }
});