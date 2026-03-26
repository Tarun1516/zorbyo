import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function WelcomeScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image source={require('../../assets/Logo-zorbyo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>ZORBYO</Text>
        <Text style={styles.subtitle}>Your Gateway to Freelancing, Learning & Growth</Text>

        <View style={styles.features}>
          {[
            { icon: 'school-outline', text: 'Learn' },
            { icon: 'briefcase-outline', text: 'Work' },
            { icon: 'code-slash-outline', text: 'Practice' },
            { icon: 'people-outline', text: 'Connect' },
          ].map((f, i) => (
            <View key={i} style={styles.featureItem}>
              <Ionicons name={f.icon as any} size={24} color="#E5493D" />
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Auth')}>
          <Text style={styles.buttonText}>Get Started</Text>
          <Ionicons name="arrow-forward" size={20} color="#FFF" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.loginButton} onPress={() => navigation.navigate('Auth')}>
          <Text style={styles.loginButtonText}>Login to Existing Account</Text>
        </TouchableOpacity>

        <Text style={styles.tagline}>Where Talent Meets Opportunity</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  logo: { width: 150, height: 150, marginBottom: 20 },
  title: { fontSize: 42, fontFamily: 'Geist_700Bold', color: '#E5493D', letterSpacing: 8, marginBottom: 8 },
  subtitle: { fontSize: 16, fontFamily: 'Geist_400Regular', color: '#666', textAlign: 'center', marginBottom: 40 },
  features: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 40, gap: 16 },
  featureItem: { alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 12, minWidth: 70, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  featureText: { marginTop: 8, fontSize: 12, fontFamily: 'Geist_500Medium', color: '#333' },
  button: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E5493D', paddingVertical: 16, paddingHorizontal: 48, borderRadius: 30, gap: 8 },
  buttonText: { color: '#FFF', fontSize: 18, fontFamily: 'Geist_600SemiBold' },
  loginButton: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 48, borderRadius: 30, borderWidth: 1, borderColor: '#E5493D' },
  loginButtonText: { color: '#E5493D', fontSize: 16, fontFamily: 'Geist_500Medium' },
  tagline: { marginTop: 40, fontSize: 14, fontFamily: 'Geist_400Regular', color: '#999', fontStyle: 'italic' },
});
