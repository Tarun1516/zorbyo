import React, { useState, useCallback, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  Modal, 
  ScrollView, 
  ActivityIndicator, 
  Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_V1 } from '../config/api';
import { useAuth } from '../context/AuthContext';

interface Domain {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: number;
  explanation?: string;
}

interface PracticeQuiz {
  id: string;
  domain: string;
  level: number;
  questions: QuizQuestion[];
  pass_score: number;
}

interface QuizResult {
  id: string;
  quiz_id: string;
  domain: string;
  level: number;
  score: number;
  total_questions: number;
  percentage: number;
  passed: boolean;
  feedback: string;
}

interface DomainProgress {
  domain: string;
  current_level: number;
  passed: boolean;
  best_score: number;
  attempts: number;
  completed_at: string | null;
}

const domains: Domain[] = [
  { id: '1', name: 'Web Dev', icon: 'globe-outline', color: '#2196F3' },
  { id: '2', name: 'Mobile', icon: 'phone-portrait-outline', color: '#4CAF50' },
  { id: '3', name: 'UI/UX', icon: 'color-palette-outline', color: '#9C27B0' },
  { id: '4', name: 'Graphics', icon: 'brush-outline', color: '#FF9800' },
  { id: '5', name: 'Video', icon: 'videocam-outline', color: '#E91E63' },
  { id: '6', name: 'Data Sci', icon: 'analytics-outline', color: '#00BCD4' },
  { id: '7', name: 'ML/AI', icon: 'hardware-chip-outline', color: '#673AB7' },
  { id: '8', name: 'Security', icon: 'shield-checkmark-outline', color: '#F44336' },
  { id: '9', name: 'Cloud', icon: 'cloud-outline', color: '#3F51B5' },
  { id: '10', name: 'DevOps', icon: 'git-branch-outline', color: '#795548' },
  { id: '11', name: 'Blockchain', icon: 'cube-outline', color: '#607D8B' },
  { id: '12', name: 'Games', icon: 'game-controller-outline', color: '#FF5722' },
  { id: '13', name: 'Marketing', icon: 'megaphone-outline', color: '#FFC107' },
  { id: '14', name: 'Writing', icon: 'document-text-outline', color: '#8BC34A' },
  { id: '15', name: 'SEO', icon: 'search-outline', color: '#009688' },
  { id: '16', name: 'Social', icon: 'logo-instagram', color: '#E91E63' },
  { id: '17', name: 'Photo', icon: 'camera-outline', color: '#9E9E9E' },
  { id: '18', name: 'Audio', icon: 'musical-notes-outline', color: '#FF9800' },
  { id: '19', name: 'Animation', icon: 'film-outline', color: '#673AB7' },
  { id: '20', name: '3D', icon: 'shapes-outline', color: '#2196F3' },
  { id: '21', name: 'Sales', icon: 'cart-outline', color: '#4CAF50' },
  { id: '22', name: 'Finance', icon: 'cash-outline', color: '#00BCD4' },
  { id: '23', name: 'Accounting', icon: 'calculator-outline', color: '#795548' },
  { id: '24', name: 'PM', icon: 'list-outline', color: '#FF5722' },
  { id: '25', name: 'HR', icon: 'people-outline', color: '#9C27B0' },
];

export default function PracticeScreen() {
  const { user, updateUser } = useAuth();
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [quiz, setQuiz] = useState<PracticeQuiz | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState<Record<number, {selected: number, correct: boolean}>>({});
  const [domainProgress, setDomainProgress] = useState<Record<string, DomainProgress>>({});
  const [progressLoading, setProgressLoading] = useState(false);

  const userId = user?.id || 'user_1';

  useEffect(() => {
    fetchPracticeProgress();
  }, []);

  const fetchPracticeProgress = async () => {
    setProgressLoading(true);
    try {
      const response = await fetch(`${API_V1}/courses/practice/progress?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setDomainProgress(data.domains || {});
      }
    } catch (err) {
      console.error('Failed to fetch practice progress:', err);
    } finally {
      setProgressLoading(false);
    }
  };

  const startQuiz = useCallback(async (domain: Domain, level: number = 1) => {
    setSelectedDomain(domain);
    setQuizLoading(true);
    setQuiz(null);
    setQuizAnswers([]);
    setAnsweredQuestions({});
    setActiveQuestion(0);
    setQuizSubmitted(false);
    setQuizResult(null);

    try {
      const response = await fetch(`${API_V1}/courses/practice/generate?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.name, level }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate quiz');
      }

      const data = await response.json();
      
      if (!data.questions || data.questions.length < 25) {
        Alert.alert('Error', 'Failed to generate enough questions. Please try again.');
        return;
      }

      const practiceQuiz: PracticeQuiz = {
        id: data.id,
        domain: data.domain,
        level: data.level,
        questions: data.questions.slice(0, 25),
        pass_score: data.pass_score || 18,
      };

      setQuiz(practiceQuiz);
      setQuizAnswers(new Array(25).fill(-1));
      setShowQuiz(true);
    } catch (err) {
      console.error('Failed to start quiz:', err);
      Alert.alert('Error', 'Failed to generate quiz. Please try again.');
    } finally {
      setQuizLoading(false);
    }
  }, [userId]);

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
    if (Object.keys(answeredQuestions).length < 25) {
      Alert.alert('Incomplete Quiz', 'Answer all 25 questions before submitting.');
      return;
    }

    setQuizLoading(true);
    try {
      const response = await fetch(`${API_V1}/courses/practice/submit?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quiz_id: quiz.id, answers: quizAnswers, domain: selectedDomain?.name }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit quiz');
      }

      const result = await response.json();
      setQuizResult(result);
      setQuizSubmitted(true);

      // Refresh practice progress
      await fetchPracticeProgress();

      // Sync user level/XP from backend
      try {
        const userRes = await fetch(`${API_V1.replace('/api/v1', '')}/api/v1/users/${userId}`);
        if (userRes.ok) {
          const userData = await userRes.json();
          await updateUser({
            level: userData.level,
            xp: userData.xp,
          });
        }
      } catch (syncErr) {
        console.error('Failed to sync user data:', syncErr);
      }
    } catch (err) {
      console.error('Failed to submit quiz:', err);
      Alert.alert('Error', 'Failed to submit quiz. Please try again.');
    } finally {
      setQuizLoading(false);
    }
  };

  const closeQuizModal = () => {
    setShowQuiz(false);
    setQuiz(null);
    setQuizAnswers([]);
    setAnsweredQuestions({});
    setActiveQuestion(0);
    setQuizSubmitted(false);
    setQuizResult(null);
  };

  const goBackToDomains = () => {
    setSelectedDomain(null);
  };

  const getDomainLevelStatus = (domainName: string, level: number): 'passed' | 'current' | 'locked' => {
    const progress = domainProgress[domainName];
    if (!progress) {
      return level === 1 ? 'current' : 'locked';
    }
    if (level <= progress.current_level && progress.passed) {
      return 'passed';
    }
    if (level === progress.current_level + 1 || (level === 1 && !progress.passed)) {
      return 'current';
    }
    return 'locked';
  };

  const renderDomainItem = ({ item }: { item: Domain }) => (
    <TouchableOpacity 
      style={styles.domainCard} 
      onPress={() => setSelectedDomain(item)}
      activeOpacity={0.7}
      disabled={quizLoading}
    >
      <View style={[styles.domainIcon, { backgroundColor: `${item.color}15` }]}>
        <Ionicons name={item.icon as any} size={24} color={item.color} />
      </View>
      <Text style={styles.domainName}>{item.name}</Text>
      <Text style={styles.domainLevel}>
        {domainProgress[item.name]?.passed ? `Level ${domainProgress[item.name].current_level}` : 'Level 1'}
      </Text>
    </TouchableOpacity>
  );

  const renderDomainView = () => {
    if (!selectedDomain) return null;

    const progress = domainProgress[selectedDomain.name];
    const level1Status = getDomainLevelStatus(selectedDomain.name, 1);
    const level2Status = getDomainLevelStatus(selectedDomain.name, 2);
    const level3Status = getDomainLevelStatus(selectedDomain.name, 3);

    return (
      <View style={styles.domainViewContainer}>
        <View style={styles.domainViewHeader}>
          <TouchableOpacity onPress={goBackToDomains} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#333" />
          </TouchableOpacity>
          <View style={[styles.domainViewIcon, { backgroundColor: `${selectedDomain.color}15` }]}>
            <Ionicons name={selectedDomain.icon as any} size={28} color={selectedDomain.color} />
          </View>
          <View style={styles.domainViewInfo}>
            <Text style={styles.domainViewTitle}>{selectedDomain.name}</Text>
            <Text style={styles.domainViewSubtitle}>
              {progress?.passed ? `Passed Level ${progress.current_level}` : 'Practice & Test Your Skills'}
            </Text>
          </View>
        </View>

        {progress && progress.passed && (
          <View style={styles.domainStatsRow}>
            <View style={styles.domainStatItem}>
              <Text style={styles.domainStatValue}>{progress.best_score}/25</Text>
              <Text style={styles.domainStatLabel}>Best Score</Text>
            </View>
            <View style={styles.domainStatItem}>
              <Text style={styles.domainStatValue}>{progress.attempts}</Text>
              <Text style={styles.domainStatLabel}>Attempts</Text>
            </View>
            <View style={styles.domainStatItem}>
              <Text style={styles.domainStatValue}>Level {progress.current_level}</Text>
              <Text style={styles.domainStatLabel}>Completed</Text>
            </View>
          </View>
        )}

        <Text style={styles.levelsSectionTitle}>Levels</Text>

        {/* Level 1 */}
        <TouchableOpacity
          style={[
            styles.levelCard,
            level1Status === 'passed' && styles.levelCardPassed,
            level1Status === 'current' && styles.levelCardCurrent,
          ]}
          onPress={() => level1Status !== 'locked' && startQuiz(selectedDomain, 1)}
          disabled={level1Status === 'locked' || quizLoading}
          activeOpacity={0.7}
        >
          <View style={styles.levelCardLeft}>
            <View style={[
              styles.levelBadge,
              level1Status === 'passed' && styles.levelBadgePassed,
              level1Status === 'current' && styles.levelBadgeCurrent,
            ]}>
              {level1Status === 'passed' ? (
                <Ionicons name="checkmark" size={20} color="#FFF" />
              ) : (
                <Text style={[
                  styles.levelBadgeText,
                  level1Status === 'current' && styles.levelBadgeTextCurrent,
                ]}>1</Text>
              )}
            </View>
            <View style={styles.levelInfo}>
              <Text style={[
                styles.levelTitle,
                level1Status === 'passed' && styles.levelTitlePassed,
              ]}>Level 1 - Foundation</Text>
              <Text style={styles.levelDescription}>
                {level1Status === 'passed' ? 'Completed! You passed this level.' :
                 level1Status === 'current' ? '25 questions • 70% to pass' :
                 'Locked'}
              </Text>
            </View>
          </View>
          {level1Status === 'passed' && (
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
          )}
          {level1Status === 'current' && (
            <Ionicons name="play-circle" size={24} color={selectedDomain.color} />
          )}
        </TouchableOpacity>

        {/* Level 2 - Coming Soon / Locked */}
        <View style={[styles.levelCard, styles.levelCardLocked]}>
          <View style={styles.levelCardLeft}>
            <View style={[styles.levelBadge, styles.levelBadgeLocked]}>
              <Text style={styles.levelBadgeTextLocked}>2</Text>
            </View>
            <View style={styles.levelInfo}>
              <Text style={styles.levelTitleLocked}>Level 2 - Advanced</Text>
              <View style={styles.comingSoonRow}>
                <ActivityIndicator size="small" color="#999" style={{ marginRight: 8 }} />
                <Text style={styles.comingSoonText}>Coming Soon</Text>
              </View>
            </View>
          </View>
          <Ionicons name="lock-closed" size={20} color="#CCC" />
        </View>

        {/* Level 3 - Coming Soon / Locked */}
        <View style={[styles.levelCard, styles.levelCardLocked]}>
          <View style={styles.levelCardLeft}>
            <View style={[styles.levelBadge, styles.levelBadgeLocked]}>
              <Text style={styles.levelBadgeTextLocked}>3</Text>
            </View>
            <View style={styles.levelInfo}>
              <Text style={styles.levelTitleLocked}>Level 3 - Expert</Text>
              <View style={styles.comingSoonRow}>
                <ActivityIndicator size="small" color="#999" style={{ marginRight: 8 }} />
                <Text style={styles.comingSoonText}>Coming Soon</Text>
              </View>
            </View>
          </View>
          <Ionicons name="lock-closed" size={20} color="#CCC" />
        </View>
      </View>
    );
  };

  const renderQuizContent = () => {
    if (!quiz || !quiz.questions[activeQuestion]) {
      return (
        <View style={styles.quizLoaderWrap}>
          <ActivityIndicator size="large" color="#E5493D" />
          <Text style={styles.loadingText}>Loading questions...</Text>
        </View>
      );
    }

    if (quizSubmitted && quizResult) {
      return (
        <View style={styles.quizResultWrap}>
          <Ionicons
            name={quizResult.passed ? 'checkmark-circle' : 'close-circle'}
            size={80}
            color={quizResult.passed ? '#4CAF50' : '#E5493D'}
          />
          <Text style={styles.quizResultTitle}>
            {quizResult.passed ? 'Quiz Passed!' : 'Quiz Failed'}
          </Text>
          <Text style={styles.quizResultScore}>
            Score: {quizResult.score}/{quizResult.total_questions}
          </Text>
          <Text style={styles.quizResultPercentage}>
            {quizResult.percentage.toFixed(1)}%
          </Text>
          <Text style={styles.quizResultFeedback}>
            {quizResult.feedback}
          </Text>
          <TouchableOpacity style={styles.quizCloseBtn} onPress={closeQuizModal}>
            <Text style={styles.quizCloseBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.quizContent}>
        <Text style={styles.quizQuestionCounter}>
          Question {activeQuestion + 1}/{quiz.questions.length}
        </Text>
        <ScrollView style={styles.questionScrollView}>
          <Text style={styles.quizQuestionText}>
            {quiz.questions[activeQuestion].question}
          </Text>

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

          {answeredQuestions[activeQuestion] !== undefined && quiz.questions[activeQuestion].explanation && (
            <View style={styles.explanationContainer}>
              <Ionicons name="information-circle-outline" size={16} color="#666" />
              <Text style={styles.explanationText}>
                {quiz.questions[activeQuestion].explanation}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.quizNavRow}>
          <TouchableOpacity
            style={[styles.quizNavBtn, activeQuestion === 0 && styles.quizNavBtnDisabled]}
            disabled={activeQuestion === 0}
            onPress={() => setActiveQuestion(q => Math.max(0, q - 1))}
          >
            <Text style={styles.quizNavBtnText}>Previous</Text>
          </TouchableOpacity>

          {activeQuestion < quiz.questions.length - 1 ? (
            <TouchableOpacity
              style={styles.quizNavBtn}
              onPress={() => setActiveQuestion(q => Math.min(quiz.questions.length - 1, q + 1))}
            >
              <Text style={styles.quizNavBtnText}>Next</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[
                styles.submitBtn,
                Object.keys(answeredQuestions).length < 25 && styles.submitBtnDisabled
              ]} 
              onPress={submitQuiz}
              disabled={Object.keys(answeredQuestions).length < 25}
            >
              <Text style={styles.submitBtnText}>
                Submit ({Object.keys(answeredQuestions).length}/25)
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Question Progress Dots */}
        <View style={styles.progressDotsContainer}>
          {quiz.questions.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.progressDot,
                activeQuestion === idx && styles.progressDotActive,
                answeredQuestions[idx] !== undefined && (
                  answeredQuestions[idx].correct ? styles.progressDotCorrect : styles.progressDotIncorrect
                ),
              ]}
            />
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Practice</Text>
        <Text style={styles.headerSubtitle}>
          {selectedDomain ? selectedDomain.name : 'Choose a domain and test your knowledge'}
        </Text>
      </View>

      {selectedDomain ? (
        <ScrollView style={styles.domainScrollView} showsVerticalScrollIndicator={false}>
          {renderDomainView()}
        </ScrollView>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Select Domain</Text>
          <FlatList
            data={domains}
            numColumns={4}
            keyExtractor={i => i.id}
            contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 16 }}
            columnWrapperStyle={{ gap: 6, marginBottom: 6 }}
            renderItem={renderDomainItem}
          />
        </>
      )}

      {/* Quiz Modal */}
      <Modal visible={showQuiz} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.quizContainer}>
          <View style={styles.quizHeader}>
            <View style={styles.quizHeaderLeft}>
              <TouchableOpacity onPress={closeQuizModal} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color="#333" />
              </TouchableOpacity>
              <View>
                <Text style={styles.quizTitle}>
                  {selectedDomain?.name} Quiz
                </Text>
                <Text style={styles.quizSubtitle}>Level {quiz?.level || 1} • 25 Questions</Text>
              </View>
            </View>
            <TouchableOpacity onPress={closeQuizModal}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          {quizLoading ? (
            <View style={styles.quizLoaderWrap}>
              <ActivityIndicator size="large" color="#E5493D" />
              <Text style={styles.loadingText}>Generating questions...</Text>
            </View>
          ) : (
            renderQuizContent()
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontFamily: 'Geist_700Bold', color: '#1a1a1a' },
  headerSubtitle: { fontSize: 12, fontFamily: 'Geist_400Regular', color: '#999', marginTop: 4 },
  sectionTitle: { fontSize: 11, fontFamily: 'Geist_600SemiBold', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 12, marginBottom: 10 },
  domainCard: { 
    flex: 1, 
    alignItems: 'center', 
    backgroundColor: '#F5F5F5', 
    borderRadius: 12, 
    paddingVertical: 12, 
    paddingHorizontal: 6,
    position: 'relative',
  },
  domainIcon: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 6 
  },
  domainName: { fontSize: 10, fontFamily: 'Geist_600SemiBold', color: '#333', textAlign: 'center' },
  domainLevel: { fontSize: 8, fontFamily: 'Geist_400Regular', color: '#999', marginTop: 2 },

  // Domain View
  domainScrollView: { flex: 1 },
  domainViewContainer: { paddingHorizontal: 16, paddingBottom: 24 },
  domainViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    marginBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  domainViewIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  domainViewInfo: { flex: 1 },
  domainViewTitle: { fontSize: 20, fontFamily: 'Geist_700Bold', color: '#1a1a1a' },
  domainViewSubtitle: { fontSize: 12, fontFamily: 'Geist_400Regular', color: '#999', marginTop: 2 },

  domainStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 8,
  },
  domainStatItem: { flex: 1, alignItems: 'center' },
  domainStatValue: { fontSize: 16, fontFamily: 'Geist_700Bold', color: '#1a1a1a' },
  domainStatLabel: { fontSize: 10, fontFamily: 'Geist_400Regular', color: '#999', marginTop: 2 },

  levelsSectionTitle: {
    fontSize: 11,
    fontFamily: 'Geist_600SemiBold',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  // Level Cards
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  levelCardPassed: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  levelCardCurrent: {
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFC107',
  },
  levelCardLocked: {
    opacity: 0.6,
  },
  levelCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  levelBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadgePassed: {
    backgroundColor: '#4CAF50',
  },
  levelBadgeCurrent: {
    backgroundColor: '#E5493D',
  },
  levelBadgeLocked: {
    backgroundColor: '#E0E0E0',
  },
  levelBadgeText: {
    fontSize: 14,
    fontFamily: 'Geist_700Bold',
    color: '#666',
  },
  levelBadgeTextCurrent: {
    color: '#FFF',
  },
  levelBadgeTextLocked: {
    fontSize: 14,
    fontFamily: 'Geist_700Bold',
    color: '#999',
  },
  levelInfo: { flex: 1 },
  levelTitle: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#333' },
  levelTitlePassed: { color: '#2E7D32' },
  levelTitleLocked: { fontSize: 14, fontFamily: 'Geist_600SemiBold', color: '#999' },
  levelDescription: { fontSize: 11, fontFamily: 'Geist_400Regular', color: '#666', marginTop: 2 },

  comingSoonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  comingSoonText: {
    fontSize: 11,
    fontFamily: 'Geist_400Regular',
    color: '#999',
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
  quizHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quizTitle: { fontSize: 18, fontFamily: 'Geist_700Bold', color: '#1A1A1A' },
  quizSubtitle: { fontSize: 12, fontFamily: 'Geist_400Regular', color: '#999' },

  quizLoaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, color: '#777', fontFamily: 'Geist_400Regular' },

  quizContent: { flex: 1, padding: 16 },
  quizQuestionCounter: { fontSize: 12, fontFamily: 'Geist_600SemiBold', color: '#E5493D', marginBottom: 8 },
  questionScrollView: { flex: 1 },
  quizQuestionText: { fontSize: 18, fontFamily: 'Geist_700Bold', color: '#222', marginBottom: 14, lineHeight: 26 },

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
  optionText: { color: '#333', fontSize: 14, fontFamily: 'Geist_400Regular', lineHeight: 20 },
  optionTextSelected: { color: '#E5493D', fontFamily: 'Geist_600SemiBold' },
  optionTextCorrect: { color: '#2E7D32', fontFamily: 'Geist_600SemiBold' },
  optionTextIncorrect: { color: '#C62828', fontFamily: 'Geist_600SemiBold' },

  explanationContainer: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  explanationText: { flex: 1, fontSize: 12, fontFamily: 'Geist_400Regular', color: '#666', lineHeight: 18 },

  quizNavRow: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' },
  quizNavBtn: {
    minWidth: 100,
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
  submitBtnDisabled: { backgroundColor: '#CCC' },
  submitBtnText: { color: '#FFF', fontSize: 14, fontFamily: 'Geist_600SemiBold' },

  // Progress dots
  progressDotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 16,
    justifyContent: 'center',
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E8E8E8',
  },
  progressDotActive: { backgroundColor: '#E5493D', width: 12, borderRadius: 6 },
  progressDotCorrect: { backgroundColor: '#4CAF50' },
  progressDotIncorrect: { backgroundColor: '#F44336' },

  // Quiz Result
  quizResultWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  quizResultTitle: { marginTop: 16, fontSize: 24, fontFamily: 'Geist_700Bold', color: '#222' },
  quizResultScore: { marginTop: 8, fontSize: 32, fontFamily: 'Geist_700Bold', color: '#E5493D' },
  quizResultPercentage: { fontSize: 18, fontFamily: 'Geist_600SemiBold', color: '#666', marginTop: 4 },
  quizResultFeedback: { marginTop: 16, textAlign: 'center', color: '#666', fontSize: 14, fontFamily: 'Geist_400Regular', lineHeight: 20 },
  quizCloseBtn: { marginTop: 22, borderRadius: 10, backgroundColor: '#E5493D', paddingHorizontal: 26, paddingVertical: 12 },
  quizCloseBtnText: { color: '#FFF', fontSize: 15, fontFamily: 'Geist_600SemiBold' },
});
