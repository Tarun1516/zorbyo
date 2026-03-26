import httpx
from typing import List, Dict, Any
import json
import re
from app.core.config import settings


class AIService:
    """Service for AI integration using OpenRouter"""

    def __init__(self):
        self.api_key = settings.OPENROUTER_API_KEY
        self.model = settings.OPENROUTER_MODEL
        self.base_url = "https://openrouter.ai/api/v1"

    async def generate_quiz_questions(
        self, chapter_content: str, num_questions: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Generate quiz questions from chapter content

        Args:
            chapter_content: Text content or transcript of the chapter
            num_questions: Number of questions to generate

        Returns:
            List of question objects with question, options, and correct_answer
        """
        prompt = f"""
        Based on the following educational content, generate {num_questions} multiple-choice questions.
        Each question should have 4 options (A, B, C, D) with one correct answer.
        
        Content:
        {chapter_content[:3000]}  # Limit content length
        
        Return ONLY valid JSON array format (no markdown, no code blocks):
        [
            {{
                "question": "Question text?",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correct_answer": 0
            }}
        ]
        
        Make sure questions test understanding of key concepts, not just memorization.
        correct_answer should be the index (0-3) of the correct option.
        """

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {
                                "role": "system",
                                "content": "You are an educational quiz generator. Generate clear, relevant multiple-choice questions. Return ONLY valid JSON, no markdown.",
                            },
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.7,
                        "max_tokens": 4000,  # Increased for practice quizzes
                    },
                )

                if response.status_code == 200:
                    result = response.json()
                    content = (
                        result.get("choices", [{}])[0]
                        .get("message", {})
                        .get("content", "")
                    )

                    # Try to parse JSON from the response
                    try:
                        # Remove markdown code blocks if present
                        content = re.sub(r"```json\s*", "", content)
                        content = re.sub(r"```\s*", "", content)
                        content = content.strip()

                        questions = json.loads(content)
                        if isinstance(questions, list):
                            return questions[:num_questions]
                        return []
                    except json.JSONDecodeError:
                        print(f"Failed to parse AI response as JSON: {content}")
                        return []
                else:
                    print(f"AI API error: {response.status_code}")
                    return []
        except Exception as e:
            print(f"Error generating quiz: {e}")
            return []

    async def verify_code_submission(
        self, code: str, task_description: str
    ) -> Dict[str, Any]:
        """
        Verify a code submission for practice tasks

        Args:
            code: The submitted code
            task_description: Description of the task

        Returns:
            Verification result with score and feedback
        """
        prompt = f"""
        Review this code submission for the following task:
        
        Task: {task_description}
        
        Code:
        ```
        {code}
        ```
        
        Evaluate:
        1. Does it solve the task?
        2. Code quality and best practices
        3. Error handling
        4. Efficiency
        
        Return JSON:
        {{
            "score": 0-100,
            "passed": true/false,
            "feedback": "Detailed feedback",
            "suggestions": ["suggestion1", "suggestion2"]
        }}
        """

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {
                                "role": "system",
                                "content": "You are a code reviewer. Evaluate code submissions fairly.",
                            },
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 1000,
                    },
                )

                if response.status_code == 200:
                    # TODO: Parse response
                    return {
                        "score": 80,
                        "passed": True,
                        "feedback": "Good work!",
                        "suggestions": [],
                    }
                else:
                    return {
                        "score": 0,
                        "passed": False,
                        "feedback": "Verification failed",
                        "suggestions": [],
                    }
        except Exception as e:
            print(f"Error verifying code: {e}")
            return {
                "score": 0,
                "passed": False,
                "feedback": "Error occurred",
                "suggestions": [],
            }

    async def extract_id_card_info(self, image_base64: str) -> Dict[str, Any]:
        """
        Extract information from student ID card using vision

        Args:
            image_base64: Base64 encoded image of ID card

        Returns:
            Extracted information: name, college, valid_thru
        """
        # TODO: Implement with Gemini Vision or similar
        # For now, return mock data
        return {
            "name": "Student Name",
            "college_name": "College Name",
            "valid_thru": "2026-12-31",
            "confidence": 0.95,
        }

    async def job_match_score(
        self, user_profile: Dict[str, Any], job_description: str
    ) -> int:
        """
        Calculate match score between user profile and job

        Args:
            user_profile: User's skills, experience, etc.
            job_description: Job posting description

        Returns:
            Match score 0-100
        """
        # TODO: Implement AI matching
        return 75


ai_service = AIService()
