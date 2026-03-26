import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const bounties = [
  { id: '1', app: 'SecureBank App', client: 'SecureBank Ltd', reward: 15000, scope: 'Web App', reports: 5 },
  { id: '2', app: 'ShopEasy E-commerce', client: 'ShopEasy Inc', reward: 8000, scope: 'Mobile', reports: 3 },
  { id: '3', app: 'HealthTrack', client: 'HealthTrack Co', reward: 25000, scope: 'Full Stack', reports: 8 },
];

export default function BugBountyScreen() {
  const [tab, setTab] = useState<'active' | 'reports' | 'completed'>('active');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bug Bounty</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statVal}>3</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statVal}>₹48K</Text>
          <Text style={styles.statLabel}>Rewards</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statVal}>16</Text>
          <Text style={styles.statLabel}>Reports</Text>
        </View>
      </View>

      <View style={styles.tabsRow}>
        {['active', 'reports', 'completed'].map(t => (
          <TouchableOpacity 
            key={t} 
            style={[styles.tab, tab === t && styles.tabActive]} 
            onPress={() => setTab(t as any)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={bounties}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.scopeBadge}>
                <Text style={styles.scopeText}>{item.scope}</Text>
              </View>
              <Text style={styles.reward}>₹{item.reward.toLocaleString()}</Text>
            </View>
            <Text style={styles.title}>{item.app}</Text>
            <View style={styles.cardBottom}>
              <View style={styles.clientRow}>
                <Ionicons name="business-outline" size={12} color="#999" />
                <Text style={styles.client}>{item.client}</Text>
              </View>
              <View style={styles.reportsRow}>
                <Ionicons name="document-text-outline" size={12} color="#999" />
                <Text style={styles.reports}>{item.reports}</Text>
              </View>
              <TouchableOpacity style={styles.submitBtn}>
                <Ionicons name="shield-checkmark-outline" size={12} color="#FFF" />
                <Text style={styles.submitBtnText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontFamily: 'Geist_700Bold', color: '#1a1a1a' },
  statsRow: { flexDirection: 'row', marginHorizontal: 12, marginBottom: 12, backgroundColor: '#F8F8F8', borderRadius: 10, padding: 12 },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 16, fontFamily: 'Geist_700Bold', color: '#E5493D' },
  statLabel: { fontSize: 10, fontFamily: 'Geist_400Regular', color: '#999', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: '#E8E8E8', marginVertical: 4 },
  tabsRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 7, borderRadius: 6, backgroundColor: '#F5F5F5', alignItems: 'center' },
  tabActive: { backgroundColor: '#FFF0ED' },
  tabText: { fontSize: 11, fontFamily: 'Geist_500Medium', color: '#999' },
  tabTextActive: { color: '#E5493D' },
  card: { backgroundColor: '#FFF', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#F0F0F0' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  scopeBadge: { backgroundColor: '#E8EAF6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  scopeText: { fontSize: 10, fontFamily: 'Geist_500Medium', color: '#3F51B5' },
  reward: { fontSize: 14, fontFamily: 'Geist_700Bold', color: '#4CAF50' },
  title: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#1a1a1a', marginBottom: 8 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  client: { fontSize: 11, fontFamily: 'Geist_400Regular', color: '#999' },
  reportsRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  reports: { fontSize: 11, fontFamily: 'Geist_400Regular', color: '#999' },
  submitBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', backgroundColor: '#E5493D', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, gap: 3 },
  submitBtnText: { color: '#FFF', fontSize: 11, fontFamily: 'Geist_600SemiBold' },
});
