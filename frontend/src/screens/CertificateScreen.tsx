import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_V1 } from '../config/api';
import { useAuth } from '../context/AuthContext';

interface CertificatePayload {
  id: string;
  user_id: string;
  course_id: string;
  issued_at: string;
  certificate_url: string;
  certificate_number: string;
}

export default function CertificateScreen({ route, navigation }: any) {
  const { courseId, courseTitle } = route.params;
  const { user } = useAuth();
  const userId = user?.id || 'user_1';

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [certificate, setCertificate] = useState<CertificatePayload | null>(null);

  const certificateDate = useMemo(() => {
    if (!certificate?.issued_at) return new Date().toLocaleDateString();
    return new Date(certificate.issued_at).toLocaleDateString();
  }, [certificate?.issued_at]);

  const getCertificate = async () => {
    setLoading(true);
    try {
      const issueRes = await fetch(`${API_V1}/courses/${courseId}/certificate?user_id=${userId}`, {
        method: 'POST',
      });

      if (!issueRes.ok) {
        const msg = await issueRes.text();
        throw new Error(msg || 'Failed to issue certificate');
      }

      const data = (await issueRes.json()) as CertificatePayload;
      setCertificate(data);
    } catch (err: any) {
      console.error('Certificate fetch failed', err);
      Alert.alert('Certificate Unavailable', 'Complete all chapter quizzes and final exam to unlock certificate.');
      setCertificate(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getCertificate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const onDownloadCertificate = async () => {
    if (!certificate) return;
    setDownloading(true);
    try {
      const fallbackUrl = `${API_V1}/courses/${courseId}/certificate/pdf?user_id=${userId}`;
      const url = certificate.certificate_url || fallbackUrl;
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        throw new Error('Cannot open certificate URL');
      }
      await Linking.openURL(url);
    } catch (err) {
      console.error('Certificate download failed', err);
      Alert.alert('Download Failed', 'Unable to open certificate PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Certificate</Text>
      </View>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color="#E5493D" />
          <Text style={styles.loadingText}>Preparing certificate...</Text>
        </View>
      ) : !certificate ? (
        <View style={styles.centerWrap}>
          <Ionicons name="alert-circle-outline" size={52} color="#E5493D" />
          <Text style={styles.emptyTitle}>Certificate not ready</Text>
          <Text style={styles.emptyInfo}>Finish all requirements to unlock your downloadable PDF certificate.</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.card}>
            <Ionicons name="ribbon" size={34} color="#E5493D" />
            <Text style={styles.cardTitle}>Course Completion Certificate</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>User Name</Text>
              <Text style={styles.metaValue}>{user?.name || 'Learner'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Course Name</Text>
              <Text style={styles.metaValue}>{courseTitle}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Issued Date</Text>
              <Text style={styles.metaValue}>{certificateDate}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Certificate Number</Text>
              <Text style={styles.metaValue}>{certificate.certificate_number}</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.downloadBtn, downloading && styles.downloadBtnDisabled]} onPress={onDownloadCertificate} disabled={downloading}>
            {downloading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="download-outline" size={18} color="#FFF" />
                <Text style={styles.downloadBtnText}>Download PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: { padding: 4, marginRight: 12 },
  headerTitle: { fontSize: 22, fontFamily: 'Geist_700Bold', color: '#1A1A1A' },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  loadingText: { marginTop: 12, fontFamily: 'Geist_400Regular', color: '#666' },
  emptyTitle: { marginTop: 10, fontSize: 22, color: '#1A1A1A', fontFamily: 'Geist_700Bold' },
  emptyInfo: { marginTop: 8, fontSize: 13, color: '#777', textAlign: 'center', fontFamily: 'Geist_400Regular' },

  body: { flex: 1, padding: 16, justifyContent: 'space-between' },
  card: {
    borderWidth: 1,
    borderColor: '#F0F0F0',
    borderRadius: 14,
    padding: 16,
    backgroundColor: '#FFF9F8',
  },
  cardTitle: { marginTop: 8, marginBottom: 14, fontSize: 18, color: '#1A1A1A', fontFamily: 'Geist_700Bold' },
  metaRow: {
    borderTopWidth: 1,
    borderTopColor: '#F1E3E1',
    paddingVertical: 10,
  },
  metaLabel: { fontSize: 11, color: '#8A8A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Geist_600SemiBold' },
  metaValue: { marginTop: 2, fontSize: 14, color: '#252525', fontFamily: 'Geist_400Regular' },

  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E5493D',
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 10,
  },
  downloadBtnDisabled: { opacity: 0.75 },
  downloadBtnText: { color: '#FFF', fontSize: 15, fontFamily: 'Geist_600SemiBold' },
});
