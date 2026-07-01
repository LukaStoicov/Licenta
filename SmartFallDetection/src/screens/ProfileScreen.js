import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Button } from 'react-native';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../config/firebase';

export default function ProfileScreen({ navigation }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [apn, setApn] = useState('');
  const [my_devices, setMyDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, "users", user.uid);

    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setName(data.name || '');
            setPhone(data.phone || '');
            setApn(data.apn || '');
            setMyDevices(data.my_devices || []); 
        }
        setLoading(false);
    }, (error) => {
        console.log("Error fetching realtime data:", error);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await setDoc(doc(db, "users", user.uid), {
        name: name,
        phone: phone,
        apn: apn,
        email: user.email,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      Alert.alert("Succes", "Datele au fost actualizate!");
    } catch (error) {
      Alert.alert("Eroare", "Nu s-au putut salva datele: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Deconectare",
      "Ești sigur că vrei să te deconectezi?",
      [
        { text: "Nu", style: "cancel" },
        { text: "Da", onPress: () => signOut(auth).catch(err => console.log(err)) }
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Profilul Meu</Text>
      <Text style={styles.subHeader}>{user?.email}</Text>
      
      <View style={styles.form}>
        <Text style={styles.label}>Nume Complet</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Introdu numele"
        />

        <Text style={styles.label}>Telefon</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="07xx..."
        />

        <Text style={styles.label}>Internet (APN)</Text>
        <TextInput
          style={styles.input}
          value={apn}
          onChangeText={setApn}
          placeholder="ex: net"
        />

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Salvează Modificările</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Dispozitivele mele ({my_devices.length}):</Text>
        
        {my_devices.length === 0 ? (
            <Text style={styles.emptyText}>Nu ai niciun dispozitiv asociat.</Text>
        ) : (
            my_devices.map((deviceId, index) => (
                <View key={index} style={styles.deviceCard}>
                    <View>
                        <Text style={styles.deviceName}>Dispozitiv Monitorizare</Text>
                        <Text style={styles.deviceId}>ID: {deviceId}</Text>
                    </View>
                </View>
            ))
        )}

        <View style={styles.buttonContainer}>
            <Button 
                title="+ Adaugă Dispozitiv Nou" 
                onPress={() => navigation.navigate('Pairing')} 
            />
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Deconectare Cont</Text>
      </TouchableOpacity>
      
      <View style={{height: 50}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#f0f2f5' },
  header: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  subHeader: { fontSize: 14, color: '#666', marginBottom: 20 },
  
  form: { backgroundColor: 'white', padding: 20, borderRadius: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#eee', fontSize: 16 },
  
  saveButton: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  
  listContainer: { marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  
  deviceCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  deviceName: { fontSize: 16, fontWeight: 'bold', color: '#007AFF' },
  deviceId: { fontSize: 14, color: '#555', marginTop: 4 },
  
  emptyText: { fontStyle: 'italic', color: '#888', textAlign: 'center', marginBottom: 20 },
  buttonContainer: { marginTop: 10, marginBottom: 20 },

  logoutButton: { alignItems: 'center', padding: 15, borderWidth: 1, borderColor: '#FF3B30', borderRadius: 10, backgroundColor: 'white', marginTop: 10 },
  logoutText: { color: '#FF3B30', fontWeight: 'bold', fontSize: 16 }
});