import React, { useState } from 'react';
import { View, Text, Button, FlatList, TouchableOpacity, Alert, StyleSheet, Platform, PermissionsAndroid, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location'; 
import { scanForDevices, stopScan, performPairing } from '../services/BluetoothService';
import { auth, db } from '../config/firebase';
import { doc, setDoc, updateDoc, arrayUnion, collection, addDoc } from "firebase/firestore";

const PairingScreen = ({ navigation }) => {
    const [devices, setDevices] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    const requestPermissions = async () => {
        if (Platform.OS === 'android') {
            try {
                const granted = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                ]);

                if (
                    granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
                    granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
                    granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
                ) {
                    return true;
                } else {
                    Alert.alert("Permisiuni refuzate", "Avem nevoie de Bluetooth și Locație pentru conectare.");
                    return false;
                }
            } catch (err) {
                console.warn(err);
                return false;
            }
        }
        return true;
    };

    const startScanHandler = async () => {
        const permissionGranted = await requestPermissions();
        if (!permissionGranted) return;

        setDevices([]);
        setIsScanning(true);
        
        scanForDevices((device) => {
            setDevices(currentList => {
                if (!currentList.find(d => d.id === device.id)) {
                    return [...currentList, device];
                }
                return currentList;
            });
        });

        setTimeout(() => {
            stopScan();
            setIsScanning(false);
        }, 10000);
    };

    const handleConnect = async (device) => {
        stopScan();
        setIsConnecting(true);

        try {
            let locationStatus = await Location.requestForegroundPermissionsAsync();
            if (locationStatus.status !== 'granted') {
                Alert.alert("Eroare", "Trebuie să acorzi acces la locație pentru a trimite coordonatele.");
                setIsConnecting(false);
                return;
            }

            let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const homeLat = location.coords.latitude;
            const homeLng = location.coords.longitude;

            const currentUser = auth.currentUser;
            const configData = {
                uid: currentUser.uid,
                deviceId: device.id,
                lat: homeLat,
                lng: homeLng
            };
            
            await performPairing(device.id, configData);

            const userRef = doc(db, "users", currentUser.uid);
            await updateDoc(userRef, {
                my_devices: arrayUnion(device.id)
            }).catch(async (err) => {
                await setDoc(userRef, { my_devices: [device.id] });
            });

            const alertsRef = collection(db, 'alerts');
            await addDoc(alertsRef, {
                device_id: device.id,
                userId: currentUser.uid,
                latitude: homeLat,
                longitude: homeLng,
                timestamp: new Date().toISOString(),
                isFall: false
            });

            Alert.alert("Succes", "Dispozitiv configurat și locație salvată!", [
                { text: "OK", onPress: () => navigation.goBack() }
            ]);

        } catch (error) {
            console.error(error);
            Alert.alert("Eroare", "Conexiunea Bluetooth a eșuat. Verifică brățara.");
        } finally {
            setIsConnecting(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Împerechere Dispozitiv</Text>

            <Button 
                title={isScanning ? "Se caută..." : "Caută Brățara"} 
                onPress={startScanHandler} 
                disabled={isScanning || isConnecting}
            />

            {isConnecting && (
                <View style={styles.loadingBox}>
                    <ActivityIndicator size="large" color="#0000ff" />
                    <Text>Se trimit setările...</Text>
                </View>
            )}

            <FlatList
                data={devices}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <TouchableOpacity 
                        style={styles.deviceItem} 
                        onPress={() => handleConnect(item)}
                        disabled={isConnecting}
                    >
                        <Text style={styles.deviceName}>{item.name || "ESP32"}</Text>
                        <Text style={styles.macText}>{item.id}</Text>
                        <Text style={styles.connectText}>Conectează</Text>
                    </TouchableOpacity>
                )}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#fff' },
    title: { fontSize: 22, marginBottom: 20, fontWeight: 'bold', textAlign: 'center' },
    loadingBox: { alignItems: 'center', marginVertical: 20 },
    deviceItem: { padding: 15, backgroundColor: '#f9f9f9', marginVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#ccc' },
    deviceName: { fontWeight: 'bold', fontSize: 18, color: '#333' },
    macText: { color: '#666', marginTop: 3 },
    connectText: { color: '#007AFF', marginTop: 8, fontWeight: 'bold' }
});

export default PairingScreen;