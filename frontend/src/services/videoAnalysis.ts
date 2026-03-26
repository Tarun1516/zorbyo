import { Platform } from 'react-native';
import { API_V1 } from '../config/api';

// API base URL
const API_BASE_URL = API_V1.replace('/api/v1', '');

interface VideoAnalysisResult {
  transcript: string;
  keyTopics: string[];
  summary: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedWatchTime: number;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: number;
}

interface VideoTimestamp {
  time: number;
  description: string;
}

class VideoAnalysisService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${API_BASE_URL}/api/v1`;
  }

  /**
   * Analyze video content and extract key information
   */
  async analyzeVideoContent(
    videoUrl: string,
    courseId: string,
    chapterIndex: number
  ): Promise<VideoAnalysisResult> {
    try {
      const response = await fetch(`${this.baseUrl}/courses/${courseId}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_url: videoUrl,
          chapter_index: chapterIndex,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze video');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error analyzing video:', error);
      
      // Return mock data for development
      return {
        transcript: 'This is a mock transcript of the video content.',
        keyTopics: ['Topic 1', 'Topic 2', 'Topic 3'],
        summary: 'This video covers the fundamental concepts of the subject.',
        difficulty: 'beginner',
        estimatedWatchTime: 600,
      };
    }
  }

  /**
   * Generate quiz questions based on video content
   */
  async generateQuizFromVideo(
    videoUrl: string,
    courseId: string,
    chapterIndex: number,
    numQuestions: number = 5
  ): Promise<QuizQuestion[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/courses/${courseId}/quiz/generate?chapter_index=${chapterIndex}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate quiz');
      }

      const data = await response.json();
      return data.questions || [];
    } catch (error) {
      console.error('Error generating quiz:', error);
      
      // Return mock quiz questions for development
      return [
        {
          question: 'What is the main concept discussed in this video?',
          options: ['Concept A', 'Concept B', 'Concept C', 'Concept D'],
          correct_answer: 0,
        },
        {
          question: 'Which technique was demonstrated?',
          options: ['Technique 1', 'Technique 2', 'Technique 3', 'Technique 4'],
          correct_answer: 1,
        },
        {
          question: 'What is the recommended approach?',
          options: ['Approach A', 'Approach B', 'Approach C', 'Approach D'],
          correct_answer: 2,
        },
        {
          question: 'How does this apply to real-world scenarios?',
          options: ['Application 1', 'Application 2', 'Application 3', 'Application 4'],
          correct_answer: 0,
        },
        {
          question: 'What should you remember from this chapter?',
          options: ['Point A', 'Point B', 'Point C', 'Point D'],
          correct_answer: 3,
        },
      ];
    }
  }

  /**
   * Get video timestamps with descriptions
   */
  async getVideoTimestamps(
    videoUrl: string,
    courseId: string,
    chapterIndex: number
  ): Promise<VideoTimestamp[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/courses/${courseId}/timestamps?chapter_index=${chapterIndex}`
      );

      if (!response.ok) {
        throw new Error('Failed to get timestamps');
      }

      const data = await response.json();
      return data.timestamps || [];
    } catch (error) {
      console.error('Error getting timestamps:', error);
      
      // Return mock timestamps for development
      return [
        { time: 0, description: 'Introduction' },
        { time: 60, description: 'Main concept explanation' },
        { time: 180, description: 'Practical example' },
        { time: 300, description: 'Summary and key takeaways' },
      ];
    }
  }

  /**
   * Extract key frames from video for analysis
   */
  async extractKeyFrames(
    videoUrl: string,
    numFrames: number = 5
  ): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/video/extract-frames`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_url: videoUrl,
          num_frames: numFrames,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to extract frames');
      }

      const data = await response.json();
      return data.frame_urls || [];
    } catch (error) {
      console.error('Error extracting frames:', error);
      return [];
    }
  }

  /**
   * Analyze video quality and provide recommendations
   */
  async analyzeVideoQuality(videoUrl: string): Promise<{
    quality: 'low' | 'medium' | 'high';
    resolution: string;
    bitrate: string;
    recommendations: string[];
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/video/analyze-quality`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_url: videoUrl,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze video quality');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error analyzing video quality:', error);
      
      // Return mock data for development
      return {
        quality: 'high',
        resolution: '1920x1080',
        bitrate: '5000 kbps',
        recommendations: [
          'Video quality is excellent',
          'Audio is clear and well-balanced',
          'Consider adding captions for accessibility',
        ],
      };
    }
  }

  /**
   * Get video transcript with timestamps
   */
  async getVideoTranscript(
    videoUrl: string,
    language: string = 'en'
  ): Promise<{
    transcript: string;
    timestamps: Array<{ start: number; end: number; text: string }>;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/video/transcript`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_url: videoUrl,
          language,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get transcript');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting transcript:', error);
      
      // Return mock data for development
      return {
        transcript: 'This is a mock transcript of the video content.',
        timestamps: [
          { start: 0, end: 10, text: 'Welcome to this lesson.' },
          { start: 10, end: 25, text: 'Today we will learn about...' },
          { start: 25, end: 40, text: 'Let me show you an example.' },
        ],
      };
    }
  }

  /**
   * Search within video content
   */
  async searchInVideo(
    videoUrl: string,
    query: string
  ): Promise<Array<{ timestamp: number; relevance: number; context: string }>> {
    try {
      const response = await fetch(`${this.baseUrl}/video/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_url: videoUrl,
          query,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to search in video');
      }

      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('Error searching in video:', error);
      return [];
    }
  }

  /**
   * Generate chapter summary
   */
  async generateChapterSummary(
    courseId: string,
    chapterIndex: number
  ): Promise<{
    summary: string;
    keyPoints: string[];
    relatedTopics: string[];
  }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/courses/${courseId}/chapters/${chapterIndex}/summary`
      );

      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error generating summary:', error);
      
      // Return mock data for development
      return {
        summary: 'This chapter covers the fundamental concepts and practical applications.',
        keyPoints: [
          'Key concept 1 explained',
          'Key concept 2 demonstrated',
          'Practical example provided',
        ],
        relatedTopics: ['Related Topic 1', 'Related Topic 2'],
      };
    }
  }
}

export const videoAnalysisService = new VideoAnalysisService();
export default videoAnalysisService;
