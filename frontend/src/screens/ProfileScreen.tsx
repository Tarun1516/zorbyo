import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { API_V1 } from '../config/api';

const API_BASE_URL = API_V1.replace('/api/v1', '');

interface UserStats {
  certificates: number;
  tests: number;
  projects: number;
  connections: number;
}

interface Connection {
  id: string;
  name: string;
  email: string;
  user_type: string;
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<UserStats>({
    certificates: 0,
    tests: 0,
    projects: 0,
    connections: 0,
  });
  const [connections, setConnections] = useState<Connection[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      const userId = user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      // Fetch connections
      const connectionsRes = await fetch(`${API_BASE_URL}/api/v1/chat/connections?user_id=${userId}`);
      if (connectionsRes.ok) {
        const connectionsData = await connectionsRes.json();
        const transformedConnections: Connection[] = connectionsData.map((c: any) => ({
          id: c.id,
          name: c.user2_name || c.user1_name || 'Unknown',
          email: '',
          user_type: '',
        }));
        setConnections(transformedConnections);
        setStats(prev => ({ ...prev, connections: transformedConnections.length }));
      }

      // Fetch user profile for skills
      const profileRes = await fetch(`${API_BASE_URL}/api/v1/users/${userId}/profile`);
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setSkills(profileData.skills || []);
        if (profileData.certificates_count !== undefined) {
          setStats(prev => ({ ...prev, certificates: profileData.certificates_count }));
        }
        if (profileData.tests_count !== undefined) {
          setStats(prev => ({ ...prev, tests: profileData.tests_count }));
        }
        if (profileData.projects_count !== undefined) {
          setStats(prev => ({ ...prev, projects: profileData.projects_count }));
        }
      }
    } catch (error) {
      console.error('Error fetching profile data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statsDisplay = [
    { label: 'Certificates', icon: 'ribbon-outline', count: stats.certificates },
    { label: 'Tests', icon: 'checkmark-done-outline', count: stats.tests },
    { label: 'Projects', icon: 'briefcase-outline', count: stats.projects },
    { label: 'Connections', icon: 'people-outline', count: stats.connections },
  ];

  const accountDetails = [
    { id: 'email', title: 'Email', value: user?.email || 'user@example.com', icon: 'mail-outline' },
    { id: 'type', title: 'Account Type', value: user?.userType || 'Not selected', icon: 'person-outline' },
    { id: 'verified', title: 'Verification', value: user?.verified ? 'Verified' : 'Not verified', icon: 'checkmark-circle-outline' },
    { id: 'joined', title: 'Member Since', value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Unknown', icon: 'calendar-outline' },
  ];

  const settings = [
    { id: 'edit', title: 'Edit Profile', icon: 'create-outline' },
    { id: 'security', title: 'Security', icon: 'shield-outline' },
    { id: 'notif', title: 'Notifications', icon: 'notifications-outline' },
    { id: 'privacy', title: 'Privacy', icon: 'lock-closed-outline' },
    { id: 'payment', title: 'Payment Methods', icon: 'card-outline' },
    { id: 'help', title: 'Help & Support', icon: 'help-circle-outline' },
    { id: 'about', title: 'About ZORBYO', icon: 'information-circle-outline' },
  ];

  const handleSettingPress = (settingId: string) => {
    Alert.alert('Coming Soon', 'This feature is under development');
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#E5493D" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={22} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{user?.name || 'User'}</Text>
          <Text style={styles.email}>{user?.email || 'user@example.com'}</Text>
          <View style={styles.badges}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{user?.userType || 'Student'}</Text>
            </View>
            {user?.verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={12} color="#4CAF50" />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.levelBadge}>
          <Ionicons name="star" size={10} color="#FFD700" />
          <Text style={styles.levelText}>Lv {user?.level || 1}</Text>
        </View>
      </View>

      {/* XP Card */}
      <View style={styles.xpCard}>
        <View style={styles.xpHeader}>
          <Text style={styles.xpTitle}>Experience Points</Text>
          <Text style={styles.xpVal}>{user?.xp || 0} / 500 XP</Text>
        </View>
        <View style={styles.xpBar}>
          <View style={[styles.xpFill, { width: `${((user?.xp || 0) / 500) * 100}%` }]} />
        </View>
        <Text style={styles.xpNext}>Next level: {500 - (user?.xp || 0)} XP</Text>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        {statsDisplay.map((s, i) => (
          <TouchableOpacity key={i} style={styles.statItem}>
            <Ionicons name={s.icon as any} size={18} color="#E5493D" />
            <Text style={styles.statCount}>{s.count}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Connections Section */}
      {connections.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connections ({connections.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.connectionsScroll}>
            {connections.map((conn, i) => (
              <View key={i} style={styles.connectionItem}>
                <View style={styles.connectionAvatar}>
                  <Text style={styles.connectionAvatarText}>{conn.name.charAt(0)}</Text>
                </View>
                <Text style={styles.connectionName} numberOfLines={1}>{conn.name}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Account Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Details</Text>
        {accountDetails.map(detail => (
          <View key={detail.id} style={styles.detailItem}>
            <View style={styles.detailLeft}>
              <Ionicons name={detail.icon as any} size={18} color="#E5493D" />
              <View style={styles.detailInfo}>
                <Text style={styles.detailTitle}>{detail.title}</Text>
                <Text style={styles.detailValue}>{detail.value}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Skills Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Skills</Text>
        <View style={styles.skillsContainer}>
          {skills.length > 0 ? (
            skills.map((skill, i) => (
              <View key={i} style={styles.skillChip}>
                <Text style={styles.skillText}>{skill}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.noSkillsText}>No skills added yet</Text>
          )}
          <TouchableOpacity style={styles.addSkillBtn}>
            <Ionicons name="add" size={16} color="#E5493D" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        {settings.map(s => (
          <TouchableOpacity 
            key={s.id} 
            style={styles.menuItem}
            onPress={() => handleSettingPress(s.id)}
          >
            <View style={styles.menuLeft}>
              <Ionicons name={s.icon as any} size={18} color="#666" />
              <Text style={styles.menuText}>{s.title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#ddd" />
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Ionicons name="log-out-outline" size={18} color="#D32F2F" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      {/* Footer */}
      <View style={styles.footer}>
        <Image source={require('../../assets/Mini-logo-zorbyo.png')} style={styles.footerLogo} />
        <Text style={styles.footerText}>ZORBYO v1.0.0</Text>
        <Text style={styles.footerSubtext}>Where Talent Meets Opportunity</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontFamily: 'Geist_700Bold', color: '#1a1a1a' },
  settingsBtn: { padding: 4 },
  profileCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, padding: 16, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#F0F0F0', marginBottom: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#E5493D', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 22, fontFamily: 'Geist_700Bold', color: '#FFF' },
  profileInfo: { flex: 1 },
  name: { fontSize: 18, fontFamily: 'Geist_600SemiBold', color: '#1a1a1a' },
  email: { fontSize: 12, fontFamily: 'Geist_400Regular', color: '#666', marginTop: 2 },
  badges: { flexDirection: 'row', marginTop: 6, gap: 8 },
  typeBadge: { backgroundColor: '#FFF0ED', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 10, fontFamily: 'Geist_600SemiBold', color: '#E5493D', textTransform: 'capitalize' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, gap: 4 },
  verifiedText: { fontSize: 10, fontFamily: 'Geist_500Medium', color: '#4CAF50' },
  levelBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8E1', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, gap: 4 },
  levelText: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#F9A825' },
  xpCard: { marginHorizontal: 12, padding: 14, backgroundColor: '#F8F8F8', borderRadius: 10, marginBottom: 12 },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  xpTitle: { fontSize: 12, fontFamily: 'Geist_500Medium', color: '#666' },
  xpVal: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#E5493D' },
  xpBar: { height: 8, backgroundColor: '#E0E0E0', borderRadius: 4, overflow: 'hidden' },
  xpFill: { height: '100%', backgroundColor: '#E5493D', borderRadius: 4 },
  xpNext: { fontSize: 10, fontFamily: 'Geist_400Regular', color: '#999', marginTop: 6 },
  statsRow: { flexDirection: 'row', marginHorizontal: 12, marginBottom: 16, gap: 8 },
  statItem: { flex: 1, alignItems: 'center', backgroundColor: '#F8F8F8', borderRadius: 10, paddingVertical: 12 },
  statCount: { fontSize: 18, fontFamily: 'Geist_700Bold', color: '#1a1a1a', marginTop: 6 },
  statLabel: { fontSize: 9, fontFamily: 'Geist_400Regular', color: '#999', marginTop: 2 },
  section: { marginHorizontal: 12, marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontFamily: 'Geist_600SemiBold', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  detailItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#F8F8F8', borderRadius: 8, marginBottom: 4 },
  detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailInfo: { flex: 1 },
  detailTitle: { fontSize: 10, fontFamily: 'Geist_400Regular', color: '#999' },
  detailValue: { fontSize: 13, fontFamily: 'Geist_500Medium', color: '#333', marginTop: 2 },
  skillsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: { backgroundColor: '#FFF0ED', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  skillText: { fontSize: 12, fontFamily: 'Geist_500Medium', color: '#E5493D' },
  noSkillsText: { fontSize: 12, fontFamily: 'Geist_400Regular', color: '#999', fontStyle: 'italic' },
  addSkillBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5493D', borderStyle: 'dashed' },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: '#F8F8F8', borderRadius: 8, marginBottom: 4 },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuText: { fontSize: 13, fontFamily: 'Geist_500Medium', color: '#333' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFEBEE', borderRadius: 8, marginBottom: 20 },
  logoutText: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#D32F2F' },
  footer: { alignItems: 'center', paddingVertical: 24 },
  footerLogo: { width: 40, height: 40, marginBottom: 8 },
  footerText: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#999' },
  footerSubtext: { fontSize: 10, fontFamily: 'Geist_400Regular', color: '#ccc', marginTop: 4 },
  connectionsScroll: { flexGrow: 0 },
  connectionItem: { alignItems: 'center', marginRight: 16, width: 70 },
  connectionAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E5493D', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  connectionAvatarText: { fontSize: 18, fontFamily: 'Geist_700Bold', color: '#FFF' },
  connectionName: { fontSize: 10, fontFamily: 'Geist_500Medium', color: '#333', textAlign: 'center' },
});
