import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Modal, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { API_V1 } from '../config/api';

// API base URL
const API_BASE_URL = API_V1.replace('/api/v1', '');

// Course type definition
interface Course {
  id: string;
  title: string;
  description: string;
  domain: string;
  thumbnail_url: string | null;
  chapters: number;
  duration_hours: number;
  created_at: string;
}

interface CourseProgressResponse {
  chapter_index: number;
  video_timestamp: number;
}

export default function LearnScreen({ navigation }: any) {
  const [tab, setTab] = useState<'domains' | 'ongoing' | 'completed' | 'downloads'>('domains');
  const [menuVisible, setMenuVisible] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseProgressMap, setCourseProgressMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tabs = [
    { id: 'domains', label: 'Domains', icon: 'library-outline' },
    { id: 'ongoing', label: 'Ongoing', icon: 'time-outline' },
    { id: 'completed', label: 'Completed', icon: 'checkmark-circle-outline' },
    { id: 'downloads', label: 'Downloads', icon: 'download-outline' },
  ];

  // Fetch courses from backend
  useEffect(() => {
    fetchCourses();
    loadDownloadedCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/v1/courses/`);
      if (!response.ok) {
        throw new Error('Failed to fetch courses');
      }
      const data = await response.json();
      setCourses(data);
      if (data.length > 0) {
        await fetchProgressForCourses(data);
      }
      setError(null);
    } catch (err) {
      console.error('Error fetching courses:', err);
      setError('Failed to load courses');
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProgressForCourses = async (courseList: Course[]) => {
    try {
      const userRaw = await AsyncStorage.getItem('user');
      const parsedUser = userRaw ? JSON.parse(userRaw) : null;
      const userId = parsedUser?.id || (await AsyncStorage.getItem('user_id')) || 'user_1';

      const entries = await Promise.all(
        courseList.map(async (course) => {
          try {
            const progressRes = await fetch(`${API_BASE_URL}/api/v1/courses/${course.id}/progress?user_id=${userId}`);
            if (!progressRes.ok) return [course.id, 0] as const;
            const progressData = (await progressRes.json()) as CourseProgressResponse;
            const completedChapters = Math.max(0, Math.min(course.chapters, (progressData.chapter_index || 0) + 1));
            const percentage = Math.round((completedChapters / Math.max(course.chapters, 1)) * 100);
            return [course.id, percentage] as const;
          } catch {
            return [course.id, 0] as const;
          }
        })
      );

      setCourseProgressMap(Object.fromEntries(entries));
    } catch (err) {
      console.error('Error loading course progress percentages:', err);
    }
  };

  const loadDownloadedCourses = async () => {
    try {
      const saved = await AsyncStorage.getItem('downloaded_courses');
      if (saved) {
        setDownloaded(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading downloaded courses:', e);
    }
  };

  // Get local video path for offline viewing
  const getLocalVideoPath = async (courseId: string, chapterIndex: number): Promise<string | null> => {
    try {
      const downloadsRaw = await AsyncStorage.getItem('course_downloads');
      if (!downloadsRaw) return null;
      
      const downloadsMap = JSON.parse(downloadsRaw);
      const courseDownload = downloadsMap[courseId];
      
      if (!courseDownload?.files) return null;
      
      const localPath = courseDownload.files[chapterIndex.toString()];
      if (!localPath) return null;
      
      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      return fileInfo.exists ? localPath : null;
    } catch (e) {
      console.error('Error getting local video path:', e);
      return null;
    }
  };

  const handleDownload = async (courseId: string) => {
    try {
      const saved = await AsyncStorage.getItem('downloaded_courses');
      const list = saved ? JSON.parse(saved) : [];
      
      if (list.includes(courseId)) {
        Alert.alert('Already Downloaded', 'This course is already available offline');
        setMenuVisible(null);
        return;
      }

      // Get user ID for the download request
      const userRaw = await AsyncStorage.getItem('user');
      const parsedUser = userRaw ? JSON.parse(userRaw) : null;
      const userId = parsedUser?.id || (await AsyncStorage.getItem('user_id')) || 'user_1';

      // Start download process
      setDownloading(courseId);
      setDownloadProgress({ [courseId]: 0 });

      // Request download URLs from backend
      const response = await fetch(`${API_BASE_URL}/api/v1/courses/${courseId}/download?user_id=${userId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to get download URLs');
      }

      const data = await response.json();
      const downloadUrls = data.download_urls || [];

      if (downloadUrls.length === 0) {
        throw new Error('No videos available for download');
      }

      // Create directory for this course
      const courseDir = `${FileSystem.documentDirectory}courses/${courseId}/`;
      await FileSystem.makeDirectoryAsync(courseDir, { intermediates: true });

      // Download each chapter video
      const downloadedFiles: Record<string, string> = {};
      let completedDownloads = 0;

      for (const chapter of downloadUrls) {
        const fileName = `chapter_${chapter.chapter_index}.mp4`;
        const localUri = `${courseDir}${fileName}`;

        // Download the video file
        const downloadResult = await FileSystem.downloadAsync(
          chapter.url,
          localUri,
          {
            md5: false,
          }
        );

        if (downloadResult.status === 200) {
          downloadedFiles[chapter.chapter_index.toString()] = localUri;
          completedDownloads++;
          setDownloadProgress({ [courseId]: (completedDownloads / downloadUrls.length) * 100 });
        } else {
          console.warn(`Failed to download chapter ${chapter.chapter_index}`);
        }
      }

      // Save download info to storage
      const downloadInfo = {
        courseId,
        downloadedAt: new Date().toISOString(),
        files: downloadedFiles,
      };

      const existingDownloads = await AsyncStorage.getItem('course_downloads');
      const downloadsMap = existingDownloads ? JSON.parse(existingDownloads) : {};
      downloadsMap[courseId] = downloadInfo;
      await AsyncStorage.setItem('course_downloads', JSON.stringify(downloadsMap));

      // Update downloaded courses list
      list.push(courseId);
      await AsyncStorage.setItem('downloaded_courses', JSON.stringify(list));
      setDownloaded(list);

      Alert.alert(
        'Download Complete',
        `Course saved for offline viewing. ${completedDownloads} chapter(s) downloaded.`
      );
    } catch (e: any) {
      console.error('Download error:', e);
      Alert.alert('Download Failed', e.message || 'Failed to download course. Please try again.');
    } finally {
      setDownloading(null);
      setDownloadProgress({});
    }
    setMenuVisible(null);
  };

  const handleCoursePress = (course: Course) => {
    // Navigate to course details/player
    navigation.navigate('CoursePlayer', { courseId: course.id, courseTitle: course.title });
  };

  const handleDeleteDownload = async (courseId: string) => {
    try {
      // Delete local files
      const courseDir = `${FileSystem.documentDirectory}courses/${courseId}/`;
      const dirInfo = await FileSystem.getInfoAsync(courseDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(courseDir, { idempotent: true });
      }

      // Update storage
      const saved = await AsyncStorage.getItem('downloaded_courses');
      const list = saved ? JSON.parse(saved) : [];
      const updatedList = list.filter((id: string) => id !== courseId);
      await AsyncStorage.setItem('downloaded_courses', JSON.stringify(updatedList));

      const downloadsRaw = await AsyncStorage.getItem('course_downloads');
      const downloadsMap = downloadsRaw ? JSON.parse(downloadsRaw) : {};
      delete downloadsMap[courseId];
      await AsyncStorage.setItem('course_downloads', JSON.stringify(downloadsMap));

      setDownloaded(updatedList);
      Alert.alert('Deleted', 'Course removed from offline storage');
    } catch (e) {
      console.error('Error deleting download:', e);
      Alert.alert('Error', 'Failed to delete course');
    }
    setMenuVisible(null);
  };

  const renderMenu = (courseId: string) => {
    const isDownloaded = downloaded.includes(courseId);
    
    return (
      <Modal visible={menuVisible === courseId} transparent animationType="fade">
        <TouchableOpacity style={styles.menuOverlay} onPress={() => setMenuVisible(null)}>
          <View style={styles.menuContent}>
            {isDownloaded ? (
              <TouchableOpacity style={styles.menuItem} onPress={() => handleDeleteDownload(courseId)}>
                <Ionicons name="trash-outline" size={18} color="#E5493D" />
                <Text style={[styles.menuItemText, { color: '#E5493D' }]}>Remove Download</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={[styles.menuItem, downloading === courseId && styles.menuItemDisabled]} 
                onPress={() => downloading !== courseId && handleDownload(courseId)}
                disabled={downloading === courseId}
              >
                {downloading === courseId ? (
                  <ActivityIndicator size="small" color="#E5493D" />
                ) : (
                  <Ionicons name="download-outline" size={18} color="#666" />
                )}
                <Text style={styles.menuItemText}>
                  {downloading === courseId ? 'Downloading...' : 'Download for Offline'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(null)}>
              <Ionicons name="share-outline" size={18} color="#666" />
              <Text style={styles.menuItemText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(null)}>
              <Ionicons name="information-circle-outline" size={18} color="#666" />
              <Text style={styles.menuItemText}>Course Info</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => setMenuVisible(null)}>
              <Ionicons name="bookmark-outline" size={18} color="#666" />
              <Text style={styles.menuItemText}>Save to Collection</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  const renderCourseItem = ({ item }: { item: Course }) => {
    const isDownloading = downloading === item.id;
    const progress = downloadProgress[item.id] || 0;
    
    return (
      <TouchableOpacity style={styles.card} onPress={() => handleCoursePress(item)}>
        <View style={styles.thumb}>
          {isDownloading ? (
            <ActivityIndicator size="small" color="#E5493D" />
          ) : (
            <Ionicons name="play" size={20} color="#E5493D" />
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.domain}>{item.domain}</Text>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.desc}>{item.description}</Text>
          <Text style={styles.progressText}>Progress: {courseProgressMap[item.id] ?? 0}%</Text>
          {isDownloading && (
            <View style={styles.downloadProgressContainer}>
              <View style={styles.downloadProgressBar}>
                <View style={[styles.downloadProgressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.downloadProgressText}>{Math.round(progress)}%</Text>
            </View>
          )}
          <View style={styles.meta}>
            <View style={styles.metaItem}>
              <Ionicons name="book-outline" size={11} color="#999" />
              <Text style={styles.metaText}>{item.chapters} ch</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={11} color="#999" />
              <Text style={styles.metaText}>{item.duration_hours}h</Text>
            </View>
            {downloaded.includes(item.id) && (
              <View style={styles.downloadedBadge}>
                <Ionicons name="checkmark-circle" size={11} color="#4CAF50" />
                <Text style={styles.downloadedText}>Offline</Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setMenuVisible(item.id)}>
          <Ionicons name="ellipsis-vertical" size={16} color="#999" />
        </TouchableOpacity>
        {renderMenu(item.id)}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Learn</Text>
      </View>

      <View style={styles.tabsRow}>
        {tabs.map(t => (
          <TouchableOpacity 
            key={t.id} 
            style={[styles.tab, tab === t.id && styles.tabActive]} 
            onPress={() => setTab(t.id as any)}
          >
            <Ionicons name={t.icon as any} size={14} color={tab === t.id ? '#E5493D' : '#999'} />
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E5493D" />
          <Text style={styles.loadingText}>Loading courses...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={40} color="#E5493D" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchCourses}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
          renderItem={renderCourseItem}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="book-outline" size={40} color="#ddd" />
              <Text style={styles.emptyText}>No courses yet</Text>
            </View>
          }
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Courses are opensource & publicly available. Zorbyo doesn't own copyright.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontFamily: 'Geist_700Bold', color: '#1a1a1a' },
  tabsRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F5F5F5', gap: 4 },
  tabActive: { backgroundColor: '#FFF0ED' },
  tabText: { fontSize: 11, fontFamily: 'Geist_500Medium', color: '#999' },
  tabTextActive: { color: '#E5493D' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 10, marginBottom: 8, padding: 12, borderWidth: 1, borderColor: '#F0F0F0' },
  thumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#FFF0ED', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  info: { flex: 1 },
  domain: { fontSize: 10, fontFamily: 'Geist_600SemiBold', color: '#E5493D', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  title: { fontSize: 13, fontFamily: 'Geist_600SemiBold', color: '#1a1a1a', marginBottom: 2 },
  desc: { fontSize: 10, fontFamily: 'Geist_400Regular', color: '#999', marginBottom: 4 },
  progressText: { fontSize: 10, fontFamily: 'Geist_600SemiBold', color: '#E5493D', marginBottom: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 10, fontFamily: 'Geist_400Regular', color: '#999' },
  downloadedBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#E8F5E9', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  downloadedText: { fontSize: 9, fontFamily: 'Geist_500Medium', color: '#4CAF50' },
  menuBtn: { padding: 8, marginLeft: 4 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  menuContent: { backgroundColor: '#FFF', borderRadius: 12, padding: 4, width: 200, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  menuItemDisabled: { opacity: 0.6 },
  menuItemLast: { borderBottomWidth: 0 },
  menuItemText: { fontSize: 13, fontFamily: 'Geist_500Medium', color: '#333' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { marginTop: 8, fontSize: 13, fontFamily: 'Geist_400Regular', color: '#ccc' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FAFAFA', paddingVertical: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  footerText: { fontSize: 10, fontFamily: 'Geist_400Regular', color: '#bbb', textAlign: 'center' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, fontFamily: 'Geist_400Regular', color: '#999' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  errorText: { marginTop: 12, fontSize: 14, fontFamily: 'Geist_400Regular', color: '#666', textAlign: 'center' },
  retryBtn: { marginTop: 16, backgroundColor: '#E5493D', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: '#FFF', fontSize: 14, fontFamily: 'Geist_600SemiBold' },
  downloadProgressContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  downloadProgressBar: { flex: 1, height: 4, backgroundColor: '#E8E8E8', borderRadius: 2, overflow: 'hidden' },
  downloadProgressFill: { height: '100%', backgroundColor: '#E5493D', borderRadius: 2 },
  downloadProgressText: { fontSize: 9, fontFamily: 'Geist_500Medium', color: '#E5493D' },
});
