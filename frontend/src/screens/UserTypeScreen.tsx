import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

const types = [
  { type: 'student' as const, title: 'Student/Freelancer', desc: 'Learn, practice, find projects', icon: 'school-outline', color: '#E5493D' },
  { type: 'client' as const, title: 'Client', desc: 'Post projects, hire talent', icon: 'business-outline', color: '#E58E3D' },
  { type: 'investor' as const, title: 'Investor', desc: 'Discover & fund startups', icon: 'trending-up-outline', color: '#4CAF50' },
];

export default function UserTypeScreen({ navigation }: any) {
  const { setUserType } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!selected) return Alert.alert('Select', 'Please choose your role');
    await setUserType(selected as any);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color="#333" />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title}>Choose Your Role</Text>
        <Text style={styles.subtitle}>Select how you want to use ZORBYO</Text>

        <View style={styles.cards}>
          {types.map(t => (
            <TouchableOpacity key={t.type} style={[styles.card, selected === t.type && { borderColor: t.color, backgroundColor: `${t.color}10` }]} onPress={() => setSelected(t.type)}>
              <View style={[styles.iconBox, { backgroundColor: `${t.color}15` }]}>
                <Ionicons name={t.icon as any} size={32} color={t.color} />
              </View>
              <Text style={styles.cardTitle}>{t.title}</Text>
              <Text style={styles.cardDesc}>{t.desc}</Text>
              {selected === t.type && (
                <View style={[styles.check, { backgroundColor: t.color }]}>
                  <Ionicons name="checkmark" size={16} color="#FFF" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[styles.btn, !selected && { backgroundColor: '#ccc' }]} onPress={handleContinue} disabled={!selected}>
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>

        <Text style={styles.note}>Students require .edu.in or .ac.in email verification</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  back: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 },
  content: { flex: 1, paddingHorizontal: 24 },
  title: { fontSize: 28, fontFamily: 'Geist_700Bold', color: '#1a1a1a', marginBottom: 8 },
  subtitle: { fontSize: 16, fontFamily: 'Geist_400Regular', color: '#666', marginBottom: 32 },
  cards: { gap: 16, marginBottom: 32 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, borderWidth: 2, borderColor: '#E0E0E0', position: 'relative' },
  iconBox: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 18, fontFamily: 'Geist_600SemiBold', color: '#1a1a1a', marginBottom: 4 },
  cardDesc: { fontSize: 14, fontFamily: 'Geist_400Regular', color: '#666' },
  check: { position: 'absolute', top: 16, right: 16, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btn: { backgroundColor: '#E5493D', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#FFF', fontSize: 16, fontFamily: 'Geist_600SemiBold' },
  note: { marginTop: 24, fontSize: 12, fontFamily: 'Geist_400Regular', color: '#999', textAlign: 'center' },
});
