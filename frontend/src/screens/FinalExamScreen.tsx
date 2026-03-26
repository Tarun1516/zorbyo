import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ExamQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
}

const FINAL_EXAM_QUESTIONS: ExamQuestion[] = [
  { question: 'What is the strongest indicator of chapter understanding?', options: ['Memorization only', 'Accurate practical application', 'Skipping examples', 'Avoiding review'], correctAnswer: 1 },
  { question: 'Which study pattern usually leads to better retention?', options: ['Passive watching', 'Spaced active recall', 'Single marathon session', 'No revision'], correctAnswer: 1 },
  { question: 'How should errors be treated while learning?', options: ['Hide them', 'Use them as feedback', 'Ignore and move on', 'Blame tools'], correctAnswer: 1 },
  { question: 'Best way to confirm concept mastery?', options: ['Teach/explain it', 'Read title only', 'Skip exercises', 'Do nothing'], correctAnswer: 0 },
  { question: 'What does iteration improve most?', options: ['Guessing', 'Confidence with evidence', 'Random trial only', 'Confusion'], correctAnswer: 1 },
  { question: 'Why are quizzes used in this course?', options: ['To block users', 'To verify chapter outcomes', 'Only for decoration', 'To replace videos'], correctAnswer: 1 },
  { question: 'Which option aligns with disciplined learning?', options: ['Track progress', 'Never measure', 'Avoid notes', 'Skip fundamentals'], correctAnswer: 0 },
  { question: 'If unsure about an answer, what should you do?', options: ['Random click', 'Re-evaluate context', 'Quit immediately', 'Ignore question'], correctAnswer: 1 },
  { question: 'What is a reliable sign of readiness for final exam?', options: ['All chapters passed', 'Only one chapter watched', 'No attempts taken', 'No notes reviewed'], correctAnswer: 0 },
  { question: 'How should MCQ distractors be handled?', options: ['Pick longest option always', 'Eliminate unlikely choices first', 'Choose first by default', 'Never read all'], correctAnswer: 1 },
  { question: 'What supports long-term mastery?', options: ['Consistent practice', 'Last-minute cramming only', 'No reflection', 'Skipping feedback'], correctAnswer: 0 },
  { question: 'When should progress be synced?', options: ['Never', 'Only after app close', 'Periodically and on milestones', 'Only on errors'], correctAnswer: 2 },
  { question: 'How should chapter outcomes affect navigation?', options: ['No gating', 'Unlock after demonstrated understanding', 'Random unlocks', 'Always locked'], correctAnswer: 1 },
  { question: 'Which threshold passes this final exam?', options: ['50%', '60%', '70%', '90%'], correctAnswer: 2 },
  { question: 'What happens after passing final exam?', options: ['Course resets', 'Certificate flow is enabled', 'Nothing', 'Account locked'], correctAnswer: 1 },
];

const PASS_MARK = 10;

export default function FinalExamScreen({ route, navigation }: any) {
  const { courseId, courseTitle } = route.params;

  const [answers, setAnswers] = useState<number[]>(new Array(FINAL_EXAM_QUESTIONS.length).fill(-1));
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  const unansweredCount = useMemo(() => answers.filter(a => a === -1).length, [answers]);
  const passed = submitted && score >= PASS_MARK;

  const onSelect = (questionIndex: number, optionIndex: number) => {
    const updated = [...answers];
    updated[questionIndex] = optionIndex;
    setAnswers(updated);
  };

  const onSubmit = () => {
    if (unansweredCount > 0) {
      Alert.alert('Incomplete Exam', `Please answer all 15 questions. Remaining: ${unansweredCount}`);
      return;
    }

    let nextScore = 0;
    FINAL_EXAM_QUESTIONS.forEach((q, i) => {
      if (answers[i] === q.correctAnswer) nextScore += 1;
    });

    setScore(nextScore);
    setSubmitted(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>Final Exam</Text>
          <Text style={styles.subtitle}>{courseTitle}</Text>
        </View>
      </View>

      {submitted ? (
        <View style={styles.resultWrap}>
          <Ionicons name={passed ? 'checkmark-circle' : 'close-circle'} size={88} color={passed ? '#4CAF50' : '#E5493D'} />
          <Text style={styles.resultTitle}>{passed ? 'Passed' : 'Not Passed'}</Text>
          <Text style={styles.resultScore}>Score: {score}/15</Text>
          <Text style={styles.resultMessage}>
            {passed ? 'You cleared the final exam (>= 70%). You can now download your certificate.' : 'Pass threshold is 70% (10/15). Review and retake the exam.'}
          </Text>

          {passed ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('Certificate', { courseId, courseTitle, finalScore: score })}
            >
              <Ionicons name="download-outline" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>Go to Certificate</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                setSubmitted(false);
                setScore(0);
                setAnswers(new Array(FINAL_EXAM_QUESTIONS.length).fill(-1));
              }}
            >
              <Ionicons name="refresh" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>Retake Exam</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <ScrollView style={styles.examBody} contentContainerStyle={styles.examBodyContent}>
            {FINAL_EXAM_QUESTIONS.map((q, qIndex) => (
              <View key={qIndex} style={styles.questionCard}>
                <Text style={styles.questionTitle}>{qIndex + 1}. {q.question}</Text>
                {q.options.map((opt, optIdx) => (
                  <TouchableOpacity
                    key={`${qIndex}-${optIdx}`}
                    style={[styles.optionBtn, answers[qIndex] === optIdx && styles.optionSelected]}
                    onPress={() => onSelect(qIndex, optIdx)}
                  >
                    <Text style={[styles.optionText, answers[qIndex] === optIdx && styles.optionTextSelected]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.footerHint}>{'Pass criteria: 70% (>= 10/15)'}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={onSubmit}>
              <Ionicons name="checkmark-done" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>Submit Final Exam</Text>
            </TouchableOpacity>
          </View>
        </>
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
  backBtn: { padding: 4, marginRight: 10 },
  headerInfo: { flex: 1 },
  title: { fontSize: 22, fontFamily: 'Geist_700Bold', color: '#1A1A1A' },
  subtitle: { marginTop: 2, fontSize: 12, fontFamily: 'Geist_400Regular', color: '#666' },

  examBody: { flex: 1 },
  examBodyContent: { padding: 16, paddingBottom: 140 },
  questionCard: {
    borderWidth: 1,
    borderColor: '#F0F0F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#FFF',
  },
  questionTitle: { fontSize: 15, lineHeight: 22, fontFamily: 'Geist_600SemiBold', color: '#202020', marginBottom: 10 },
  optionBtn: {
    backgroundColor: '#F6F6F6',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  optionSelected: { borderColor: '#E5493D', backgroundColor: '#FFF1EF' },
  optionText: { fontSize: 13, fontFamily: 'Geist_400Regular', color: '#333' },
  optionTextSelected: { color: '#E5493D', fontFamily: 'Geist_600SemiBold' },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  footerHint: { marginBottom: 8, fontSize: 12, fontFamily: 'Geist_400Regular', color: '#666' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E5493D',
    borderRadius: 10,
    paddingVertical: 14,
  },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontFamily: 'Geist_600SemiBold' },

  resultWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  resultTitle: { marginTop: 16, fontSize: 28, fontFamily: 'Geist_700Bold', color: '#1A1A1A' },
  resultScore: { marginTop: 8, fontSize: 34, fontFamily: 'Geist_700Bold', color: '#E5493D' },
  resultMessage: { marginTop: 10, fontSize: 14, color: '#666', textAlign: 'center', fontFamily: 'Geist_400Regular', marginBottom: 20 },
});
