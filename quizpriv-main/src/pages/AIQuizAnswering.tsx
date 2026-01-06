import { useState } from 'react';
import { Eye, EyeOff, RefreshCw, TrendingUp } from 'lucide-react';

interface Question {
  id: string;
  text: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  subtopic: string;
  correctAnswer: string;
  aiAnswer: string;
  confidence: number;
  context: string[];
  reasoning: string;
}

const mockQuestions: Question[] = [
  {
    id: '1',
    text: 'What is the main purpose of creating a Python virtual environment for this project?',
    difficulty: 'Easy',
    subtopic: 'Python Environment',
    correctAnswer: 'To isolate dependencies and avoid conflicts',
    aiAnswer: 'To develop an AI-powered quiz generation system from meeting transcripts',
    confidence: 95,
    context: [
      'The main objective outlined in the opening was to create a system that automatically generates quiz questions from Teams meeting transcripts.',
      'We discussed how this would help teams assess knowledge retention after important meetings.',
    ],
    reasoning: 'The AI identified this answer by analyzing the meeting introduction where the project scope was clearly defined. High confidence due to explicit statement in transcript.',
  },
  {
    id: '2',
    text: 'Explain the architectural approach for transcript preprocessing.',
    difficulty: 'Hard',
    subtopic: 'Architecture',
    correctAnswer: 'The system uses NLP pipelines to segment and clean transcripts before analysis',
    aiAnswer: 'Uses NLP-based segmentation and cleaning pipeline for transcript preparation',
    confidence: 82,
    context: [
      'During the technical discussion, we outlined a multi-stage preprocessing pipeline.',
      'The architecture includes tokenization, speaker diarization, and semantic chunking.',
    ],
    reasoning: 'AI parsed technical sections discussing preprocessing steps. Moderate-high confidence as the approach was detailed but spread across multiple conversation segments.',
  },
  {
    id: '3',
    text: 'What is the expected timeline for the MVP release?',
    difficulty: 'Medium',
    subtopic: 'Timeline',
    correctAnswer: 'Q1 2025, approximately 3 months from project kickoff',
    aiAnswer: 'Q1 2025, approximately 3 months from kickoff',
    confidence: 88,
    context: [
      'The project manager mentioned targeting Q1 2025 for the initial release.',
      'Based on current progress, we estimate a 3-month development cycle.',
    ],
    reasoning: 'Clear temporal references in the transcript enabled high-confidence extraction. Multiple mentions of Q1 2025 timeline.',
  },
];

export function AIQuizAnswering() {
  const [selectedQuestion, setSelectedQuestion] = useState<Question>(mockQuestions[0]);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null);
  const [selectedSubtopic, setSelectedSubtopic] = useState<string | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const [selectedModel, setSelectedModel] = useState('Best');

  const filteredQuestions = mockQuestions.filter((q) => {
    if (selectedDifficulty && q.difficulty !== selectedDifficulty) return false;
    if (selectedSubtopic && q.subtopic !== selectedSubtopic) return false;
    return true;
  });

  const subtopics = Array.from(new Set(mockQuestions.map((q) => q.subtopic)));

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'Hard':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'bg-green-500';
    if (confidence >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-gray-600">
          Visualize how the AI answers quiz questions with reasoning and context
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Model:</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option>Best</option>
              <option>Claude</option>
              <option>ChatGPT</option>
              <option>Gemini</option>
              <option>Custom</option>
            </select>
          </div>
          <button
            onClick={() => setShowCorrectAnswer(!showCorrectAnswer)}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2"
          >
            {showCorrectAnswer ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showCorrectAnswer ? 'Hide' : 'Show'} Correct Answers
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Filter Questions</h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">
                  Difficulty
                </label>
                <div className="flex flex-wrap gap-2">
                  {['Easy', 'Medium', 'Hard'].map((difficulty) => (
                    <button
                      key={difficulty}
                      onClick={() =>
                        setSelectedDifficulty(
                          selectedDifficulty === difficulty ? null : difficulty
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                        selectedDifficulty === difficulty
                          ? getDifficultyColor(difficulty)
                          : 'bg-gray-50 text-gray-600 border-gray-200'
                      }`}
                    >
                      {difficulty}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">
                  Subtopic
                </label>
                <div className="flex flex-wrap gap-2">
                  {subtopics.map((subtopic) => (
                    <button
                      key={subtopic}
                      onClick={() =>
                        setSelectedSubtopic(
                          selectedSubtopic === subtopic ? null : subtopic
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedSubtopic === subtopic
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {subtopic}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 text-sm">
                Questions ({filteredQuestions.length})
              </h3>
            </div>

            <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {filteredQuestions.map((question) => (
                <button
                  key={question.id}
                  onClick={() => {
                    setSelectedQuestion(question);
                    setShowReasoning(false);
                  }}
                  className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                    selectedQuestion.id === question.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <p className="text-sm text-gray-900 mb-2 line-clamp-2">
                    {question.text}
                  </p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium border ${getDifficultyColor(
                        question.difficulty
                      )}`}
                    >
                      {question.difficulty}
                    </span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                      {question.subtopic}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-medium border ${getDifficultyColor(
                      selectedQuestion.difficulty
                    )}`}
                  >
                    {selectedQuestion.difficulty}
                  </span>
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">
                    {selectedQuestion.subtopic}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 leading-relaxed">
                  {selectedQuestion.text}
                </h3>
              </div>
            </div>

            <div className="mt-6 p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-blue-900">AI Answer</p>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-700" />
                  <span className="text-sm font-medium text-blue-700">
                    {selectedQuestion.confidence}% confidence
                  </span>
                </div>
              </div>
              <p className="text-gray-900">{selectedQuestion.aiAnswer}</p>

              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-blue-700 mb-1">
                  <span>Confidence Level</span>
                  <span>{selectedQuestion.confidence}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full ${getConfidenceColor(selectedQuestion.confidence)} transition-all`}
                    style={{ width: `${selectedQuestion.confidence}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {showCorrectAnswer && (
              <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm font-semibold text-green-900 mb-2">
                  Correct Answer
                </p>
                <p className="text-gray-900">{selectedQuestion.correctAnswer}</p>
              </div>
            )}

            <button
              onClick={() => setShowCorrectAnswer(!showCorrectAnswer)}
              className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {showCorrectAnswer ? 'Hide correct answer' : 'Show correct answer'}
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h4 className="font-semibold text-gray-900 mb-4">Context Used</h4>
            <div className="space-y-3">
              {selectedQuestion.context.map((ctx, index) => (
                <div
                  key={index}
                  className="p-4 bg-gray-50 border border-gray-200 rounded-lg"
                >
                  <p className="text-sm text-gray-700 leading-relaxed">{ctx}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <h4 className="font-semibold text-gray-900">AI Reasoning</h4>
              {showReasoning ? (
                <EyeOff className="w-5 h-5 text-gray-400" />
              ) : (
                <Eye className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {showReasoning && (
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-700 leading-relaxed">
                  {selectedQuestion.reasoning}
                </p>
              </div>
            )}
          </div>

          <button className="w-full px-4 py-3 bg-white border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-medium flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Re-answer using updated transcript
          </button>
        </div>
      </div>
    </div>
  );
}
