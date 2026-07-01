import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
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

    const renderEmpty = () => {
        if (isScanning) {
            return (
                <View style={styles.emptyBox}>
                    <ActivityIndicator size="large" color="#2563EB" />
                    <Text style={styles.emptyTitle}>Se caută dispozitive...</Text>
                    <Text style={styles.emptySub}>Asigură-te că brățara este pornită și în apropiere.</Text>
                </View>
            );
        }
        return (
            <View style={styles.emptyBox}>
                <View style={styles.emptyIconWrap}>
                    <Ionicons name="bluetooth-outline" size={40} color="#94A3B8" />
                </View>
                <Text style={styles.emptyTitle}>Niciun dispozitiv găsit</Text>
                <Text style={styles.emptySub}>
                    Apasă „Caută Brățara” pentru a începe scanarea Bluetooth.
                </Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

            <View style={styles.hero}>
                <View style={styles.heroIconWrap}>
                    <Ionicons name="bluetooth" size={30} color="#2563EB" />
                </View>
                <Text style={styles.title}>Împerechere Dispozitiv</Text>
                <Text style={styles.subtitle}>
                    Conectează o brățară SmartFall nouă la contul tău
                </Text>
            </View>

            <View style={styles.contentWrap}>
                <TouchableOpacity
                    style={[
                        styles.scanButton,
                        (isScanning || isConnecting) && styles.scanButtonDisabled,
                    ]}
                    onPress={startScanHandler}
                    disabled={isScanning || isConnecting}
                    activeOpacity={0.85}
                >
                    {isScanning ? (
                        <>
                            <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.scanButtonText}>Se caută...</Text>
                        </>
                    ) : (
                        <>
                            <Ionicons name="search" size={20} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.scanButtonText}>Caută Brățara</Text>
                        </>
                    )}
                </TouchableOpacity>

                {isConnecting && (
                    <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color="#2563EB" />
                        <Text style={styles.loadingTitle}>Se conectează...</Text>
                        <Text style={styles.loadingSub}>Se trimit setările către dispozitiv</Text>
                    </View>
                )}

                {devices.length > 0 && (
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Dispozitive disponibile</Text>
                        <View style={styles.countBadge}>
                            <Text style={styles.countBadgeText}>{devices.length}</Text>
                        </View>
                    </View>
                )}

                <FlatList
                    data={devices}
                    keyExtractor={item => item.id}
                    contentContainerStyle={devices.length === 0 ? { flexGrow: 1 } : { paddingBottom: 30 }}
                    ListEmptyComponent={renderEmpty}
                    renderItem={({ item }) => (
                        <TouchableOpacity 
                            style={styles.deviceItem} 
                            onPress={() => handleConnect(item)}
                            disabled={isConnecting}
                            activeOpacity={0.85}
                        >
                            <View style={styles.deviceIconWrap}>
                                <Ionicons name="watch-outline" size={24} color="#2563EB" />
                            </View>

                            <View style={{ flex: 1 }}>
                                <Text style={styles.deviceName}>{item.name || "ESP32"}</Text>
                                <Text style={styles.macText} numberOfLines={1}>{item.id}</Text>
                            </View>

                            <View style={styles.connectBtn}>
                                <Text style={styles.connectText}>Conectează</Text>
                                <Ionicons name="chevron-forward" size={16} color="#2563EB" />
                            </View>
                        </TouchableOpacity>
                    )}
                />
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F8FAFC' },

    hero: {
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 20,
    },
    heroIconWrap: {
        width: 68,
        height: 68,
        borderRadius: 20,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#DBEAFE',
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: '#111827',
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 13,
        color: '#6B7280',
        textAlign: 'center',
        marginTop: 6,
        lineHeight: 18,
        paddingHorizontal: 20,
    },

    contentWrap: {
        flex: 1,
        paddingHorizontal: 20,
    },

    scanButton: {
        flexDirection: 'row',
        backgroundColor: '#2563EB',
        padding: 15,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 3,
    },
    scanButtonDisabled: { opacity: 0.7 },
    scanButtonText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 15,
        letterSpacing: 0.3,
    },

    loadingBox: {
        alignItems: 'center',
        padding: 20,
        marginTop: 16,
        borderRadius: 14,
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: '#DBEAFE',
    },
    loadingTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E40AF',
        marginTop: 8,
    },
    loadingSub: {
        fontSize: 12,
        color: '#3B82F6',
        marginTop: 4,
    },

    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 24,
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
    },
    countBadge: {
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 999,
        minWidth: 26,
        alignItems: 'center',
    },
    countBadgeText: {
        color: '#2563EB',
        fontSize: 12,
        fontWeight: '700',
    },

    deviceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: 'white',
        marginBottom: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    deviceIconWrap: {
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    deviceName: {
        fontWeight: '700',
        fontSize: 15,
        color: '#111827',
    },
    macText: {
        color: '#6B7280',
        marginTop: 3,
        fontSize: 12,
    },
    connectBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    connectText: {
        color: '#2563EB',
        fontWeight: '700',
        fontSize: 13,
        marginRight: 2,
    },

    emptyBox: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        marginTop: 24,
    },
    emptyIconWrap: {
        width: 74,
        height: 74,
        borderRadius: 37,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    emptyTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#334155',
        marginTop: 6,
    },
    emptySub: {
        fontSize: 13,
        color: '#94A3B8',
        marginTop: 6,
        textAlign: 'center',
        lineHeight: 18,
    },
});

export default PairingScreen;
