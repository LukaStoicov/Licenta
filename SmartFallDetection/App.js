import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View, Alert } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './src/config/firebase';
import * as Notifications from 'expo-notifications';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from './src/config/firebase';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PairingScreen from './src/screens/PairingScreen';
import DeviceDetailsScreen from './src/screens/DeviceDetailsScreen';

export const navigationRef = createNavigationContainerRef();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const Stack = createStackNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: "Acasă" }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Setări Profil" }} />
      <Stack.Screen name="Pairing" component={PairingScreen} options={{ title: "Setări dispozitive" }} />
      <Stack.Screen name="DeviceDetails" component={DeviceDetailsScreen} options={{ title: 'Detalii Dispozitiv' }} />
    </Stack.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authenticatedUser) => {
      setUser(authenticatedUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log("👆 Userul a apăsat pe notificare!");
      const data = response.notification.request.content.data;
      
      if (data && data.device_id && navigationRef.isReady()) {
        navigationRef.navigate('DeviceDetails', { deviceId: data.device_id });
      }
    });

    return () => {
      responseSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'alerts'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    let isInitialLoad = true;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (isInitialLoad) {
        isInitialLoad = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const alertData = change.doc.data();
          
          console.log("Cădere nouă detectată direct din baza de date!");

          Alert.alert(
            "ALERTĂ DE CĂDERE",
            "S-a detectat o urgență pentru unul din dispozitivele tale!",
            [
              { text: "Ignoră", style: "cancel" },
              { 
                text: "Mergi la Hartă", 
                onPress: () => {
                  if (navigationRef.isReady()) {
                    navigationRef.navigate('DeviceDetails', { deviceId: alertData.device_id });
                  }
                }
              }
            ]
          );
        }
      });
    });

    return () => unsubscribe();
  }, [user]);

useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'telemetry'),
      where('userId', '==', user.uid),
      orderBy('last_update', 'desc'),
      limit(1)
    );

    let isInitialLoad = true;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (isInitialLoad) {
        isInitialLoad = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const telemetryData = change.doc.data();
          
          if (telemetryData.battery_level && telemetryData.battery_level <= 15) {
            console.log(`Baterie scăzută detectată în timp real (${change.type}): ${telemetryData.battery_level}%`);

            Alert.alert(
              "Baterie Descărcată",
              `Brățara ta a ajuns la ${telemetryData.battery_level}%. Te rugăm să o pui la încărcat.\n\nID Dispozitiv: ${telemetryData.device_id || 'Necunoscut'}`,
              [{ text: "OK", style: "default" }]
            );
          } else {
            console.log(`Date senzori actualizate (${change.type}). Baterie OK: ${telemetryData.battery_level}%`);
          }
        }
      });
    }, (error) => {
      console.log("Eroare Firebase Telemetrie (probabil lipsă index nou):", error.message);
    });

    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {user ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
}