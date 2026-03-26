import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { AVPlaybackStatus } from 'expo-av';
import { API_V1 } from '../config/api';
import { useAuth } from '../context/AuthContext';
import RestrictedVideoPlayer from '../components/RestrictedVideoPlayer';

interface Chapter {
  id: string;
  course_id: string;
  chapter_index: number;
  title: string;
  video_url: string;
  duration_seconds: number;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: number;
}

interface Quiz {
  id: string;
  course_id: string;
  chapter_index: number;
  questions: QuizQuestion[];
}

interface ChapterProgress {
  chapter_index: number;
  video_watched: boolean;
  quiz_completed: boolean;
  chapter_completed: boolean;
  video_timestamp: number;
  duration_seconds: number;
}

interface ChapterQuizState {
  passed: boolean;
  failedAttempts: number;
  lockoutUntil?: string;
}

interface ChapterVideoState {
  watched: boolean;
}

type QuizStateMap = Record<number, ChapterQuizState>;
type VideoStateMap = Record<number, ChapterVideoState>;

const CHAPTER_PASS_MARK = 3;
const CHAPTER_QUESTION_COUNT = 5;
const LOCKOUT_MS = 24 * 60 * 60 * 1000;
const VIDEO_WATCH_THRESHOLD = 0.95; // 95% watched to unlock quiz

export default function CoursePlayerScreen({ route, navigation }: any) {
  const { courseId, courseTitle } = route.params;
  const { user } = useAuth();

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(1);
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [resumePositionMillis, setResumePositionMillis] = useState(0);
  const [quizStateMap, setQuizStateMap] = useState<QuizStateMap>({});
  const [videoStateMap, setVideoStateMap] = useState<VideoStateMap>({});
  const [chapterProgress, setChapterProgress] = useState<ChapterProgress[]>([]);

  const [showQuiz, setShowQuiz] = useState(false);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [quizLoading, setQuizLoading] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState<Record<number, {selected: number, correct: boolean}>>({});

  const videoRef = useRef<any | null>(null);
  const hasPromptedQuizForChapterRef = useRef<Record<number, boolean>>({});
  const lastSyncedTimestampRef = useRef(0);
  const lastSyncTimeRef = useRef(0);

  const userId = useMemo(() => user?.id || 'user_1', [user?.id]);
  const quizStateStorageKey = useMemo(() => `course_quiz_state:${courseId}:${userId}`, [courseId, userId]);
  const videoStateStorageKey = useMemo(() => `course_video_state:${courseId}:${userId}`, [courseId, userId]);

  const [videoDuration, setVideoDuration] = useState(0);
  const [videoWatchedPercent, setVideoWatchedPercent] = useState(0);
  const [videoCompleted, setVideoCompleted] = useState(false);
  const [localVideoUri, setLocalVideoUri] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // Load chapter progress from backend
  const loadChapterProgress = useCallback(async () => {
    try {
      const response = await fetch(`${API_V1}/courses/${courseId}/chapter-progress?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setChapterProgress(data.chapters || []);
        
        // Update local state maps from backend data
        const newVideoStateMap: VideoStateMap = {};
        const newQuizStateMap: QuizStateMap = {};
        
        for (const chapter of data.chapters || []) {
          if (chapter.video_watched) {
            newVideoStateMap[chapter.chapter_index] = { watched: true };
          }
          if (chapter.quiz_completed) {
            newQuizStateMap[chapter.chapter_index] = { passed: true, failedAttempts: 0 };
          }
        }
        
        setVideoStateMap(prev => ({ ...prev, ...newVideoStateMap }));
        setQuizStateMap(prev => ({ ...prev, ...newQuizStateMap }));
      }
    } catch (err) {
      console.error('Failed to load chapter progress', err);
    }
  }, [courseId, userId]);

  // Get local video path for offline viewing
  const getLocalVideoPath = useCallback(async (chapterIndex: number): Promise<string | null> => {
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
  }, [courseId]);

  // Determine if current chapter's video is watched (from backend or local state)
  const currentVideoWatched = useMemo(() => {
    const backendProgress = chapterProgress.find(p => p.chapter_index === currentChapter);
    return backendProgress?.video_watched || !!videoStateMap[currentChapter]?.watched || videoCompleted;
  }, [chapterProgress, videoStateMap, currentChapter, videoCompleted]);

  // Determine if current chapter's quiz is passed
  const currentQuizPassed = useMemo(() => {
    const backendProgress = chapterProgress.find(p => p.chapter_index === currentChapter);
    return backendProgress?.quiz_completed || !!quizStateMap[currentChapter]?.passed;
  }, [chapterProgress, quizStateMap, currentChapter]);

  // Chapter completion status: video watched AND quiz passed
  const chapterStatus = useMemo(() => {
    return chapters.map((chapter) => {
      const chIdx = chapter.chapter_index;
      const backendProgress = chapterProgress.find(p => p.chapter_index === chIdx);
      const videoWatched = backendProgress?.video_watched || !!videoStateMap[chIdx]?.watched;
      const quizPassed = backendProgress?.quiz_completed || !!quizStateMap[chIdx]?.passed;
      const chapterCompleted = videoWatched && quizPassed;
      const previousCompleted = chIdx === 1 || (() => {
        const prevBackend = chapterProgress.find(p => p.chapter_index === chIdx - 1);
        return (prevBackend?.chapter_completed) || 
               (!!videoStateMap[chIdx - 1]?.watched && !!quizStateMap[chIdx - 1]?.passed);
      })();
      const locked = !chapterCompleted && !previousCompleted;
      return { videoWatched, quizPassed, chapterCompleted, locked, previousCompleted };
    });
  }, [chapters, videoStateMap, quizStateMap, chapterProgress]);

  // Overall progress: fraction of chapters completed
  const overallProgress = useMemo(() => {
    if (chapters.length === 0) return 0;
    const completed = chapterStatus.filter(s => s.chapterCompleted).length;
    return completed / chapters.length;
  }, [chapters, chapterStatus]);

  const allChaptersPassed = useMemo(
    () => chapters.length > 0 && chapters.every((ch) => {
      const s = chapterStatus[chapters.indexOf(ch)];
      return s?.chapterCompleted;
    }),
    [chapters, chapterStatus]
  );

  const persistQuizState = useCallback(
    async (next: QuizStateMap) => {
      try {
        await AsyncStorage.setItem(quizStateStorageKey, JSON.stringify(next));
      } catch (err) {
        console.error('Failed to persist chapter quiz state', err);
      }
    },
    [quizStateStorageKey]
  );

  const persistVideoState = useCallback(
    async (next: VideoStateMap) => {
      try {
        await AsyncStorage.setItem(videoStateStorageKey, JSON.stringify(next));
      } catch (err) {
        console.error('Failed to persist video state', err);
      }
    },
    [videoStateStorageKey]
  );

  const syncProgress = useCallback(
    async (timestampSeconds: number, chapterIndex: number) => {
      try {
        await fetch(`${API_V1}/courses/${courseId}/progress?user_id=${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chapter_index: chapterIndex,
            video_timestamp: Math.max(0, Math.floor(timestampSeconds)),
          }),
        });
      } catch (err) {
        console.error('Failed to sync progress', err);
      }
    },
    [courseId, userId]
  );

  const markVideoWatchedBackend = useCallback(
    async (chapterIndex: number) => {
      try {
        await fetch(`${API_V1}/courses/${courseId}/video-watched?user_id=${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chapter_index: chapterIndex }),
        });
      } catch (err) {
        console.error('Failed to mark video watched on backend', err);
      }
    },
    [courseId, userId]
  );

  const loadCourseData = useCallback(async () => {
    setLoading(true);
    try {
      const [chaptersRes, progressRes, quizStateRaw, videoStateRaw] = await Promise.all([
        fetch(`${API_V1}/courses/${courseId}/chapters`),
        fetch(`${API_V1}/courses/${courseId}/progress?user_id=${userId}`),
        AsyncStorage.getItem(quizStateStorageKey),
        AsyncStorage.getItem(videoStateStorageKey),
      ]);

      if (chaptersRes.ok) {
        const chapterData = await chaptersRes.json();
        setChapters(chapterData);
      } else {
        setChapters([]);
      }

      if (progressRes.ok) {
        const progress = await progressRes.json();
        setCurrentChapter(progress.chapter_index || 1);
        setCurrentTimestamp(progress.video_timestamp || 0);
        setResumePositionMillis((progress.video_timestamp || 0) * 1000);
      }

      if (quizStateRaw) {
        const parsed = JSON.parse(quizStateRaw) as QuizStateMap;
        setQuizStateMap(parsed);
      }

      if (videoStateRaw) {
        const parsed = JSON.parse(videoStateRaw) as VideoStateMap;
        setVideoStateMap(parsed);
      }

      // Load chapter progress from backend
      await loadChapterProgress();
    } catch (err) {
      console.error('Error loading course player data', err);
      setChapters([]);
    } finally {
      setLoading(false);
    }
  }, [courseId, quizStateStorageKey, videoStateStorageKey, userId, loadChapterProgress]);

  useEffect(() => {
    loadCourseData();
  }, [loadCourseData]);

  useEffect(() => {
    const currentStatus = chapterStatus[chapters.findIndex(c => c.chapter_index === currentChapter)];
    if (currentStatus?.locked) {
      const firstUnlocked = chapters.findIndex((chapter, idx) => !chapterStatus[idx]?.locked);
      setCurrentChapter(firstUnlocked >= 0 ? chapters[firstUnlocked].chapter_index : 1);
    }
  }, [chapters, currentChapter, chapterStatus]);

  useEffect(() => {
    return () => {
      syncProgress(currentTimestamp, currentChapter);
    };
  }, [currentChapter, currentTimestamp, syncProgress]);

  // Reset video state when changing chapters
  useEffect(() => {
    setVideoCompleted(!!videoStateMap[currentChapter]?.watched);
    setVideoWatchedPercent(0);
    setVideoDuration(0);
    setLocalVideoUri(null);
    setIsOfflineMode(false);
    
    // Check for local video file
    const checkLocalVideo = async () => {
      const localPath = await getLocalVideoPath(currentChapter);
      if (localPath) {
        setLocalVideoUri(localPath);
        setIsOfflineMode(true);
      }
    };
    checkLocalVideo();
  }, [currentChapter, getLocalVideoPath]);

  const markVideoWatched = useCallback(async (chapterIndex: number) => {
    const nextMap: VideoStateMap = {
      ...videoStateMap,
      [chapterIndex]: { watched: true },
    };
    setVideoStateMap(nextMap);
    await persistVideoState(nextMap);
    await markVideoWatchedBackend(chapterIndex);
    // Reload chapter progress from backend
    await loadChapterProgress();
  }, [videoStateMap, persistVideoState, markVideoWatchedBackend, loadChapterProgress]);

  const startQuiz = useCallback(async () => {
    const chapterState = quizStateMap[currentChapter];
    const lockoutUntil = chapterState?.lockoutUntil ? new Date(chapterState.lockoutUntil).getTime() : 0;
    if (lockoutUntil > Date.now()) {
      const remainingHours = Math.ceil((lockoutUntil - Date.now()) / (1000 * 60 * 60));
      Alert.alert('Quiz Locked', `You failed twice. Retry after ${remainingHours} hour(s).`);
      return;
    }

    if (!currentVideoWatched) {
      Alert.alert('Video Not Completed', 'Please watch the complete video before taking the quiz.');
      return;
    }

    setQuizLoading(true);
    try {
      await fetch(`${API_V1}/courses/${courseId}/quiz/generate?chapter_index=${currentChapter}&user_id=${userId}`, {
        method: 'POST',
      });

      const quizRes = await fetch(`${API_V1}/courses/${courseId}/quiz/${currentChapter}`);
      if (quizRes.ok) {
        const quizData = (await quizRes.json()) as Quiz;
        const hasQuestions = quizData.questions && quizData.questions.length >= CHAPTER_QUESTION_COUNT;

        if (hasQuestions) {
          const readyQuiz = { ...quizData, questions: quizData.questions.slice(0, CHAPTER_QUESTION_COUNT) };
          setQuiz(readyQuiz);
          setQuizAnswers(new Array(CHAPTER_QUESTION_COUNT).fill(-1));
          setAnsweredQuestions({});
          setActiveQuestion(0);
          setQuizSubmitted(false);
          setQuizScore(0);
          setShowQuiz(true);
        } else {
          Alert.alert('Quiz Not Available', 'Quiz questions are being generated. Please try again in a moment.');
        }
      } else {
        const errorData = await quizRes.json().catch(() => ({}));
        if (quizRes.status === 403) {
          Alert.alert('Video Not Completed', errorData.detail || 'Please watch the complete video before taking the quiz.');
        } else {
          Alert.alert('Quiz Not Available', 'Quiz questions are being generated. Please try again in a moment.');
        }
      }
    } catch (err) {
      console.error('Failed to start quiz', err);
      Alert.alert('Error', 'Failed to load quiz. Please try again.');
    } finally {
      setQuizLoading(false);
    }
  }, [courseId, currentChapter, quizStateMap, currentVideoWatched, userId]);

  const onVideoComplete = useCallback(async () => {
    if (hasPromptedQuizForChapterRef.current[currentChapter]) {
      return;
    }
    hasPromptedQuizForChapterRef.current[currentChapter] = true;
    setVideoCompleted(true);
    await syncProgress(currentTimestamp, currentChapter);
    await markVideoWatched(currentChapter);
  }, [currentChapter, currentTimestamp, syncProgress, markVideoWatched]);

  const onPlaybackStatusUpdate = useCallback(
    async (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      const positionSeconds = Math.floor((status.positionMillis || 0) / 1000);
      const durationMillis = status.durationMillis || 0;
      const durationSeconds = durationMillis / 1000;

      setCurrentTimestamp(positionSeconds);

      if (durationSeconds > 0) {
        setVideoDuration(durationSeconds);
        const percentWatched = (positionSeconds / durationSeconds) * 100;
        setVideoWatchedPercent(Math.min(100, percentWatched));
        
        // Auto-complete video if watched threshold reached
        if (percentWatched >= VIDEO_WATCH_THRESHOLD * 100 && !videoCompleted) {
          await onVideoComplete();
        }
      }

      const now = Date.now();
      if (
        positionSeconds - lastSyncedTimestampRef.current >= 10 ||
        now - lastSyncTimeRef.current >= 12000
      ) {
        lastSyncedTimestampRef.current = positionSeconds;
        lastSyncTimeRef.current = now;
        await syncProgress(positionSeconds, currentChapter);
      }
    },
    [currentChapter, syncProgress, videoCompleted, onVideoComplete]
  );

  const onSelectAnswer = (answerIndex: number) => {
    if (!quiz || answeredQuestions[activeQuestion] !== undefined) return;
    
    const isCorrect = answerIndex === quiz.questions[activeQuestion].correct_answer;
    const updated = [...quizAnswers];
    updated[activeQuestion] = answerIndex;
    setQuizAnswers(updated);
    
    setAnsweredQuestions(prev => ({
      ...prev,
      [activeQuestion]: { selected: answerIndex, correct: isCorrect },
    }));
  };

  const submitQuiz = async () => {
    if (!quiz) return;
    if (Object.keys(answeredQuestions).length < CHAPTER_QUESTION_COUNT) {
      Alert.alert('Incomplete Quiz', 'Answer all 5 questions before submitting.');
      return;
    }

    let score = 0;
    Object.values(answeredQuestions).forEach(f => {
      if (f.correct) score += 1;
    });

    setQuizScore(score);
    setQuizSubmitted(true);

    try {
      await fetch(`${API_V1}/courses/${courseId}/quiz/submit?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quiz_id: quiz.id, answers: quizAnswers }),
      });
    } catch (err) {
      console.error('Failed to submit quiz to backend', err);
    }

    const passed = score >= CHAPTER_PASS_MARK;
    const prev = quizStateMap[currentChapter] || { passed: false, failedAttempts: 0 };

    if (passed) {
      const nextMap: QuizStateMap = {
        ...quizStateMap,
        [currentChapter]: {
          passed: true,
          failedAttempts: 0,
          lockoutUntil: undefined,
        },
      };
      setQuizStateMap(nextMap);
      await persistQuizState(nextMap);
      await syncProgress(currentTimestamp, currentChapter);
      // Reload chapter progress from backend
      await loadChapterProgress();
      return;
    }

    const failedAttempts = (prev.failedAttempts || 0) + 1;
    const lockoutUntil = failedAttempts >= 2 ? new Date(Date.now() + LOCKOUT_MS).toISOString() : undefined;
    const nextMap: QuizStateMap = {
      ...quizStateMap,
      [currentChapter]: {
        passed: false,
        failedAttempts: failedAttempts >= 2 ? 0 : failedAttempts,
        lockoutUntil,
      },
    };

    setQuizStateMap(nextMap);
    await persistQuizState(nextMap);
  };

  const closeQuizModal = () => {
    const passed = quizSubmitted && quizScore >= CHAPTER_PASS_MARK;
    setShowQuiz(false);
    setQuiz(null);
    setQuizAnswers([]);
    setAnsweredQuestions({});
    setActiveQuestion(0);

    if (passed && currentChapter < chapters.length) {
      setCurrentChapter(currentChapter + 1);
      setResumePositionMillis(0);
      setCurrentTimestamp(0);
      setVideoCompleted(false);
      setVideoWatchedPercent(0);
      setVideoDuration(0);
      hasPromptedQuizForChapterRef.current[currentChapter + 1] = false;
    }
  };

  const onPickChapter = async (chapterIndex: number) => {
    const idx = chapters.findIndex(c => c.chapter_index === chapterIndex);
    const status = chapterStatus[idx];
    if (status?.locked) {
      Alert.alert('Chapter Locked', 'Complete the previous chapter (video + quiz) to unlock this one.');
      return;
    }

    await syncProgress(currentTimestamp, currentChapter);
    setCurrentChapter(chapterIndex);
    setCurrentTimestamp(0);
    setResumePositionMillis(0);
    setVideoCompleted(!!videoStateMap[chapterIndex]?.watched);
    setVideoWatchedPercent(0);
    setVideoDuration(0);
    hasPromptedQuizForChapterRef.current[chapterIndex] = false;
  };

  const chapterLockoutText = useMemo(() => {
    const chapterState = quizStateMap[currentChapter];
    const lockoutUntil = chapterState?.lockoutUntil;
    if (!lockoutUntil) return '';
    const ms = new Date(lockoutUntil).getTime() - Date.now();
    if (ms <= 0) return '';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const mins = Math.ceil((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `Quiz locked: ${hours}h ${mins}m remaining`;
  }, [currentChapter, quizStateMap]);

  // Chapter icon based on completion state
  const getChapterIcon = (status: { videoWatched: boolean; quizPassed: boolean; chapterCompleted: boolean; locked: boolean }) => {
    if (status.chapterCompleted) {
      return <Ionicons name="checkmark-circle" size={22} color="#4CAF50" />;
    }
    if (status.videoWatched) {
      return <Ionicons name="eye" size={20} color="#FF9800" />;
    }
    if (status.locked) {
      return <Ionicons name="lock-closed" size={20} color="#999" />;
    }
    return <Ionicons name="play-circle-outline" size={20} color="#E5493D" />;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E5493D" />
        <Text style={styles.loadingText}>Loading course...</Text>
      </View>
    );
  }

  const activeChapter = chapters.find(c => c.chapter_index === currentChapter) || chapters[0];
  const currentStatus = chapterStatus[chapters.findIndex(c => c.chapter_index === currentChapter)];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.courseTitle}>{courseTitle}</Text>
          <Text style={styles.chapterTitle}>
            Chapter {currentChapter}: {activeChapter?.title || '—'}
          </Text>
        </View>
      </View>

      {/* Overall Progress Bar */}
      <View style={styles.overallProgressContainer}>
        <View style={styles.overallProgressBar}>
          <View style={[styles.overallProgressFill, { width: `${overallProgress * 100}%` }]} />
        </View>
        <Text style={styles.overallProgressText}>
          {Math.round(overallProgress * 100)}% complete ({chapterStatus.filter(s => s.chapterCompleted).length}/{chapters.length} chapters)
        </Text>
      </View>

      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer}>
        {/* Video Player Section */}
        {activeChapter ? (
          <View style={styles.videoContainer}>
            <RestrictedVideoPlayer
              source={{ uri: localVideoUri || activeChapter.video_url }}
              initialPositionMillis={resumePositionMillis}
              onPlaybackStatusUpdate={onPlaybackStatusUpdate}
              onLoad={(status) => {
                if (status.isLoaded && status.durationMillis) {
                  setVideoDuration(status.durationMillis / 1000);
                }
              }}
              onComplete={onVideoComplete}
            />
            {isOfflineMode && (
              <View style={styles.offlineIndicator}>
                <Ionicons name="cloud-offline-outline" size={12} color="#FFF" />
                <Text style={styles.offlineIndicatorText}>Offline Mode</Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Video Progress Status */}
        <View style={styles.statusRow}>
          {!currentVideoWatched && (
            <View style={styles.statusItem}>
              <Ionicons name="play-circle-outline" size={16} color="#FF9800" />
              <Text style={styles.statusText}>
                {videoWatchedPercent > 0
                  ? `Watching: ${Math.round(videoWatchedPercent)}% — Complete the video to unlock quiz`
                  : 'Start watching the video'}
              </Text>
            </View>
          )}
          {currentVideoWatched && !currentQuizPassed && (
            <View style={styles.statusItem}>
              <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
              <Text style={styles.statusTextCompleted}>Video watched ✓</Text>
            </View>
          )}
          {currentVideoWatched && currentQuizPassed && (
            <View style={styles.statusItem}>
              <Ionicons name="checkmark-done-circle" size={16} color="#4CAF50" />
              <Text style={styles.statusTextCompleted}>Chapter completed ✓</Text>
            </View>
          )}
          {chapterLockoutText ? <Text style={styles.lockoutText}>{chapterLockoutText}</Text> : null}
        </View>

        {/* Quiz Section — only visible after video is watched */}
        {currentVideoWatched && !currentQuizPassed && (
          <View style={styles.quizSection}>
            <View style={styles.quizSectionHeader}>
              <Ionicons name="help-circle" size={20} color="#E5493D" />
              <Text style={styles.quizSectionTitle}>Chapter Quiz</Text>
            </View>
            <Text style={styles.quizSectionDesc}>
              Test your understanding of this chapter. You need at least 3/5 to pass.
            </Text>
            <TouchableOpacity
              style={[styles.quizBtn, quizLoading && styles.quizBtnDisabled]}
              onPress={startQuiz}
              disabled={quizLoading}
            >
              {quizLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="help-circle-outline" size={18} color="#FFF" />
                  <Text style={styles.quizBtnText}>Take Chapter Quiz</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Quiz Passed Badge */}
        {currentQuizPassed && (
          <View style={styles.quizPassedSection}>
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            <Text style={styles.quizPassedText}>Quiz passed! Chapter {currentChapter} is complete.</Text>
          </View>
        )}

        {/* Chapters List */}
        <View style={styles.chapterListSection}>
          <Text style={styles.sectionTitle}>Chapters</Text>
          {chapters.map((chapter, index) => {
            const status = chapterStatus[index];
            const chapterState = quizStateMap[chapter.chapter_index];
            const lockoutActive = !!chapterState?.lockoutUntil && new Date(chapterState.lockoutUntil).getTime() > Date.now();

            return (
              <TouchableOpacity
                key={chapter.id}
                style={[
                  styles.chapterItem,
                  currentChapter === chapter.chapter_index && styles.chapterItemActive,
                  status?.chapterCompleted && styles.chapterItemCompleted,
                ]}
                onPress={() => onPickChapter(chapter.chapter_index)}
              >
                <View style={[
                  styles.chapterNumber,
                  status?.chapterCompleted && styles.chapterNumberCompleted,
                  status?.videoWatched && !status?.chapterCompleted && styles.chapterNumberWatched,
                ]}>
                  {status?.chapterCompleted ? (
                    <Ionicons name="checkmark" size={14} color="#FFF" />
                  ) : (
                    <Text style={styles.chapterNumberText}>{chapter.chapter_index}</Text>
                  )}
                </View>

                <View style={styles.chapterInfo}>
                  <Text style={[
                    styles.chapterItemTitle,
                    status?.chapterCompleted && styles.chapterItemTitleCompleted,
                  ]}>{chapter.title}</Text>
                  <Text style={styles.chapterDuration}>{Math.ceil(chapter.duration_seconds / 60)} min</Text>

                  {/* Chapter sub-status */}
                  <View style={styles.chapterSubStatus}>
                    <View style={styles.chapterSubItem}>
                      <Ionicons
                        name={status?.videoWatched ? "checkmark-circle" : "ellipse-outline"}
                        size={12}
                        color={status?.videoWatched ? "#4CAF50" : "#CCC"}
                      />
                      <Text style={[styles.chapterSubText, status?.videoWatched && styles.chapterSubTextDone]}>
                        Video {status?.videoWatched && '✓'}
                      </Text>
                    </View>
                    <View style={styles.chapterSubItem}>
                      <Ionicons
                        name={status?.quizPassed ? "checkmark-circle" : "ellipse-outline"}
                        size={12}
                        color={status?.quizPassed ? "#4CAF50" : "#CCC"}
                      />
                      <Text style={[styles.chapterSubText, status?.quizPassed && styles.chapterSubTextDone]}>
                        Quiz {status?.quizPassed && '✓'}
                      </Text>
                    </View>
                  </View>

                  {lockoutActive ? <Text style={styles.chapterLockoutHint}>Quiz locked 24h after 2 failed attempts</Text> : null}
                </View>

                {getChapterIcon(status || { videoWatched: false, quizPassed: false, chapterCompleted: false, locked: false })}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Final Exam Button */}
        <View style={styles.examSection}>
          <TouchableOpacity
            style={[styles.examBtn, !allChaptersPassed && styles.examBtnDisabled]}
            onPress={() => navigation.navigate('FinalExam', { courseId, courseTitle })}
            disabled={!allChaptersPassed}
          >
            <Ionicons name="document-text-outline" size={18} color="#FFF" />
            <Text style={styles.examBtnText}>Start Final Exam</Text>
          </TouchableOpacity>
          {!allChaptersPassed && (
            <Text style={styles.examLockHint}>
              Complete all chapters (video + quiz) to unlock the final exam
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Quiz Modal */}
      <Modal visible={showQuiz} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.quizContainer}>
          <View style={styles.quizHeader}>
            <Text style={styles.quizTitle}>Chapter Quiz (5 MCQs)</Text>
            <TouchableOpacity onPress={closeQuizModal}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          {!quiz || !quiz.questions[activeQuestion] ? (
            <View style={styles.quizLoaderWrap}>
              <ActivityIndicator size="large" color="#E5493D" />
            </View>
          ) : quizSubmitted ? (
            <View style={styles.quizResultWrap}>
              <Ionicons
                name={quizScore >= CHAPTER_PASS_MARK ? 'checkmark-circle' : 'close-circle'}
                size={80}
                color={quizScore >= CHAPTER_PASS_MARK ? '#4CAF50' : '#E5493D'}
              />
              <Text style={styles.quizResultTitle}>{quizScore >= CHAPTER_PASS_MARK ? 'Quiz Passed' : 'Quiz Failed'}</Text>
              <Text style={styles.quizResultScore}>Score: {quizScore}/{CHAPTER_QUESTION_COUNT}</Text>
              <Text style={styles.quizResultInfo}>
                {quizScore >= CHAPTER_PASS_MARK
                  ? 'Great! Next chapter is now unlocked.'
                  : 'Pass mark is 3/5. Two failures trigger a 24-hour lockout.'}
              </Text>
              <TouchableOpacity style={styles.quizCloseBtn} onPress={closeQuizModal}>
                <Text style={styles.quizCloseBtnText}>{quizScore >= CHAPTER_PASS_MARK ? 'Continue' : 'Close'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.quizContent}>
              <Text style={styles.quizQuestionCounter}>
                Question {activeQuestion + 1}/{CHAPTER_QUESTION_COUNT}
              </Text>
              <Text style={styles.quizQuestionText}>{quiz.questions[activeQuestion].question}</Text>

              {quiz.questions[activeQuestion].options.slice(0, 4).map((opt, idx) => {
                const feedback = answeredQuestions[activeQuestion];
                const isSelected = quizAnswers[activeQuestion] === idx;
                const isCorrectOption = idx === quiz.questions[activeQuestion].correct_answer;
                const showFeedback = feedback !== undefined;
                
                let optionStyle: any = {};
                let textStyle: any = {};
                
                if (showFeedback) {
                  if (feedback.selected === idx && feedback.correct) {
                    optionStyle = styles.optionBtnCorrect;
                    textStyle = styles.optionTextCorrect;
                  } else if (feedback.selected === idx && !feedback.correct) {
                    optionStyle = styles.optionBtnIncorrect;
                    textStyle = styles.optionTextIncorrect;
                  } else if (!feedback.correct && isCorrectOption) {
                    optionStyle = styles.optionBtnCorrectAnswer;
                    textStyle = styles.optionTextCorrect;
                  }
                } else if (isSelected) {
                  optionStyle = styles.optionBtnSelected;
                  textStyle = styles.optionTextSelected;
                }

                return (
                  <TouchableOpacity
                    key={`${activeQuestion}-${idx}`}
                    style={[styles.optionBtn, optionStyle]}
                    onPress={() => onSelectAnswer(idx)}
                    disabled={showFeedback}
                  >
                    <Text style={[styles.optionText, textStyle]}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}

              <View style={styles.quizNavRow}>
                <TouchableOpacity
                  style={[styles.quizNavBtn, activeQuestion === 0 && styles.quizNavBtnDisabled]}
                  disabled={activeQuestion === 0}
                  onPress={() => setActiveQuestion(q => Math.max(0, q - 1))}
                >
                  <Text style={styles.quizNavBtnText}>Previous</Text>
                </TouchableOpacity>

                {activeQuestion < CHAPTER_QUESTION_COUNT - 1 ? (
                  <TouchableOpacity
                    style={styles.quizNavBtn}
                    onPress={() => setActiveQuestion(q => Math.min(CHAPTER_QUESTION_COUNT - 1, q + 1))}
                  >
                    <Text style={styles.quizNavBtnText}>Next</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.submitBtn} onPress={submitQuiz}>
                    <Text style={styles.submitBtnText}>Submit</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, color: '#777', fontFamily: 'Geist_400Regular' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F1F1',
  },
  backBtn: { padding: 4, marginRight: 10 },
  headerInfo: { flex: 1 },
  courseTitle: { fontSize: 16, fontFamily: 'Geist_700Bold', color: '#1A1A1A' },
  chapterTitle: { marginTop: 2, fontSize: 12, fontFamily: 'Geist_400Regular', color: '#666' },

  // Overall progress bar
  overallProgressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  overallProgressBar: {
    height: 6,
    backgroundColor: '#E8E8E8',
    borderRadius: 3,
    overflow: 'hidden',
  },
  overallProgressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 3,
  },
  overallProgressText: {
    marginTop: 4,
    fontSize: 11,
    fontFamily: 'Geist_400Regular',
    color: '#888',
  },

  scrollContent: { flex: 1 },
  scrollContentContainer: { paddingBottom: 20 },

  // Video
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
  },
  offlineIndicator: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 30,
  },
  offlineIndicatorText: {
    color: '#FFF',
    fontSize: 10,
    fontFamily: 'Geist_500Medium',
  },

  // Status row below video
  statusRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF8F7',
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'Geist_400Regular',
    color: '#FF9800',
  },
  statusTextCompleted: {
    fontSize: 12,
    fontFamily: 'Geist_600SemiBold',
    color: '#4CAF50',
  },
  lockoutText: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: 'Geist_600SemiBold',
    color: '#E5493D',
  },

  // Quiz section (below video, shown after video watched)
  quizSection: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE0E0',
  },
  quizSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  quizSectionTitle: {
    fontSize: 16,
    fontFamily: 'Geist_700Bold',
    color: '#1A1A1A',
  },
  quizSectionDesc: {
    fontSize: 13,
    fontFamily: 'Geist_400Regular',
    color: '#666',
    marginBottom: 12,
  },
  quizBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E5493D',
    borderRadius: 10,
    paddingVertical: 14,
  },
  quizBtnDisabled: { opacity: 0.7 },
  quizBtnText: { color: '#FFF', fontFamily: 'Geist_600SemiBold', fontSize: 15 },

  // Quiz passed badge
  quizPassedSection: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quizPassedText: {
    fontSize: 14,
    fontFamily: 'Geist_600SemiBold',
    color: '#2E7D32',
    flex: 1,
  },

  // Chapters list
  chapterListSection: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Geist_600SemiBold',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  chapterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F4',
  },
  chapterItemActive: { backgroundColor: '#FFF0ED' },
  chapterItemCompleted: { backgroundColor: '#F6FFF6' },
  chapterNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F3F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  chapterNumberCompleted: { backgroundColor: '#4CAF50' },
  chapterNumberWatched: { backgroundColor: '#FFF3E0' },
  chapterNumberText: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#666' },
  chapterInfo: { flex: 1 },
  chapterItemTitle: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#242424' },
  chapterItemTitleCompleted: { color: '#4CAF50' },
  chapterDuration: { marginTop: 2, fontSize: 11, fontFamily: 'Geist_400Regular', color: '#999' },

  // Chapter sub-status (Video/Quiz indicators)
  chapterSubStatus: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  chapterSubItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chapterSubText: {
    fontSize: 10,
    fontFamily: 'Geist_400Regular',
    color: '#CCC',
  },
  chapterSubTextDone: {
    color: '#4CAF50',
    fontFamily: 'Geist_600SemiBold',
  },
  chapterLockoutHint: { marginTop: 2, fontSize: 10, fontFamily: 'Geist_400Regular', color: '#E5493D' },

  // Exam section
  examSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  examBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#B2382F',
    borderRadius: 10,
    paddingVertical: 13,
  },
  examBtnDisabled: { backgroundColor: '#C7C7C7' },
  examBtnText: { color: '#FFF', fontFamily: 'Geist_600SemiBold', fontSize: 14 },
  examLockHint: {
    marginTop: 6,
    fontSize: 11,
    fontFamily: 'Geist_400Regular',
    color: '#999',
    textAlign: 'center',
  },

  // Quiz Modal
  quizContainer: { flex: 1, backgroundColor: '#FFF' },
  quizHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  quizTitle: { fontSize: 18, fontFamily: 'Geist_700Bold', color: '#1A1A1A' },

  quizLoaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  quizContent: { flex: 1, padding: 16 },
  quizQuestionCounter: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#E5493D', marginBottom: 8 },
  quizQuestionText: { fontSize: 18, fontFamily: 'Geist_700Bold', color: '#222', marginBottom: 14 },
  optionBtn: {
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 10,
    backgroundColor: '#F7F7F7',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 9,
  },
  optionBtnSelected: { borderColor: '#E5493D', backgroundColor: '#FFF1EF' },
  optionBtnCorrect: { borderColor: '#4CAF50', backgroundColor: '#E8F5E9' },
  optionBtnIncorrect: { borderColor: '#F44336', backgroundColor: '#FFEBEE' },
  optionBtnCorrectAnswer: { borderColor: '#4CAF50', backgroundColor: '#E8F5E9' },
  optionText: { color: '#333', fontSize: 14, fontFamily: 'Geist_400Regular' },
  optionTextSelected: { color: '#E5493D', fontFamily: 'Geist_600SemiBold' },
  optionTextCorrect: { color: '#2E7D32', fontFamily: 'Geist_600SemiBold' },
  optionTextIncorrect: { color: '#C62828', fontFamily: 'Geist_600SemiBold' },

  quizNavRow: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' },
  quizNavBtn: {
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFEFEF',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 12,
  },
  quizNavBtnDisabled: { opacity: 0.5 },
  quizNavBtnText: { color: '#333', fontSize: 14, fontFamily: 'Geist_600SemiBold' },
  submitBtn: {
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5493D',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  submitBtnText: { color: '#FFF', fontSize: 14, fontFamily: 'Geist_600SemiBold' },

  quizResultWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  quizResultTitle: { marginTop: 16, fontSize: 24, fontFamily: 'Geist_700Bold', color: '#222' },
  quizResultScore: { marginTop: 8, fontSize: 32, fontFamily: 'Geist_700Bold', color: '#E5493D' },
  quizResultInfo: { marginTop: 8, textAlign: 'center', color: '#666', fontSize: 14, fontFamily: 'Geist_400Regular' },
  quizCloseBtn: { marginTop: 22, borderRadius: 10, backgroundColor: '#E5493D', paddingHorizontal: 26, paddingVertical: 12 },
  quizCloseBtnText: { color: '#FFF', fontSize: 15, fontFamily: 'Geist_600SemiBold' },
});
