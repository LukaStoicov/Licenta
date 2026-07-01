import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../config/firebase';

export default function ProfileScreen({ navigation }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
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

  const initial = (name?.charAt(0) || user?.email?.charAt(0) || '?').toUpperCase();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileHeader}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>{initial}</Text>
          </View>
          <Text style={styles.header}>{name || 'Profilul Meu'}</Text>
          <View style={styles.emailRow}>
            <Ionicons name="mail-outline" size={14} color="#6B7280" />
            <Text style={styles.subHeader}>{user?.email}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Informații personale</Text>
          </View>

          <Text style={styles.label}>Nume Complet</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Introdu numele"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <Text style={styles.label}>Telefon</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="call-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="07xx..."
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, loading && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.btnText}>Salvează Modificările</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="hardware-chip-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Dispozitivele mele</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{my_devices.length}</Text>
            </View>
          </View>

          {my_devices.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="bluetooth-outline" size={36} color="#94A3B8" />
              <Text style={styles.emptyText}>Nu ai niciun dispozitiv asociat.</Text>
            </View>
          ) : (
            my_devices.map((deviceId, index) => (
              <View key={index} style={styles.deviceCard}>
                <View style={styles.deviceIconWrap}>
                  <Ionicons name="watch-outline" size={22} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>Dispozitiv Monitorizare</Text>
                  <Text style={styles.deviceId} numberOfLines={1}>ID: {deviceId}</Text>
                </View>
                <View style={styles.statusPill}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusPillText}>Activ</Text>
                </View>
              </View>
            ))
          )}

          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('Pairing')}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle-outline" size={20} color="#2563EB" style={{ marginRight: 8 }} />
            <Text style={styles.addButtonText}>Adaugă Dispozitiv Nou</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Deconectare Cont</Text>
        </TouchableOpacity>
        
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flexGrow: 1, padding: 20 },

  profileHeader: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 22,
  },
  avatarLarge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarLargeText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
  },
  header: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subHeader: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 4,
  },

  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 8,
    flex: 1,
  },
  badge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    minWidth: 26,
    alignItems: 'center',
  },
  badgeText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
  },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 10,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },

  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#2563EB',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  btnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },

  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  deviceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  deviceId: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 5,
  },
  statusPillText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },

  emptyBox: {
    alignItems: 'center',
    padding: 22,
    marginBottom: 4,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },

  addButton: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: '#DBEAFE',
    backgroundColor: '#F8FAFC',
    borderStyle: 'dashed',
  },
  addButtonText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 14,
  },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 12,
    backgroundColor: 'white',
    marginTop: 6,
  },
  logoutText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
