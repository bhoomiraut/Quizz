import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Edit2, Trash2, Check, Copy, Search, RefreshCw, Download, AlertCircle } from 'lucide-react';

interface Question {
  id: string | number;
  question: string;
  options: string[];
  correct_options: number[];
  difficulty: string;
  type: string;
  subtopic: string;
  explanation?: string;
  marks?: number;
}

interface QuestionSet {
  _id: string;
  transcript_id: string;
  subtopics: string[];
  questions: Question[];
  num_questions: number;
  difficulty: string;
  question_type: string;
  num_options: number;
  created_at: string;
}

export function QuestionBank() {
  const [questionSets, setQuestionSets] = useState<QuestionSet[]>([]);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSubtopics, setExpandedSubtopics] = useState<Set<string>>(new Set());
  const [selectedDifficulties, setSelectedDifficulties] = useState<Set<string>>(new Set(['easy', 'medium', 'hard']));
  const [selectedSubtopics, setSelectedSubtopics] = useState<Set<string>>(new Set());
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set());

  // Fetch questions from backend API
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch question sets from backend
        const response = await fetch('http://127.0.0.1:8001/api/question-sets');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch questions: ${response.statusText}`);
        }
        
        const data = await response.json();
        const allSets = data.question_sets || [];
        
        // Get only the most recent question set (first one, since sorted by created_at desc)
        const latestSet = allSets.length > 0 ? [allSets[0]] : [];
        
        setQuestionSets(latestSet);
        
        // Flatten questions from the most recent set only
        const questions: Question[] = [];
        latestSet.forEach((set: QuestionSet) => {
          questions.push(...set.questions);
        });
        
        setAllQuestions(questions);
        
        // Auto-expand first subtopic
        if (questions.length > 0 && questions[0].subtopic) {
          setExpandedSubtopics(new Set([questions[0].subtopic]));
        }
        
        console.log(`Loaded ${questions.length} questions from latest question set`);
        
      } catch (err) {
        console.error('Error fetching questions:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch questions');
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, []);

  const subtopics = Array.from(new Set(allQuestions.map(q => q.subtopic).filter(Boolean)));

  const getSubtopicCount = (subtopic: string) => {
    return allQuestions.filter(q => q.subtopic === subtopic).length;
  };

  const toggleSubtopic = (subtopic: string) => {
    const newExpanded = new Set(expandedSubtopics);
    if (newExpanded.has(subtopic)) {
      newExpanded.delete(subtopic);
    } else {
      newExpanded.add(subtopic);
    }
    setExpandedSubtopics(newExpanded);
  };

  const toggleDifficulty = (difficulty: string) => {
    const newDifficulties = new Set(selectedDifficulties);
    if (newDifficulties.has(difficulty)) {
      newDifficulties.delete(difficulty);
    } else {
      newDifficulties.add(difficulty);
    }
    setSelectedDifficulties(newDifficulties);
  };

  const toggleSubtopicFilter = (subtopic: string) => {
    const newSubtopics = new Set(selectedSubtopics);
    if (newSubtopics.has(subtopic)) {
      newSubtopics.delete(subtopic);
    } else {
      newSubtopics.add(subtopic);
    }
    setSelectedSubtopics(newSubtopics);
  };

  const toggleAnswer = (id: string) => {
    const newExpanded = new Set(expandedAnswers);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedAnswers(newExpanded);
  };

  const filteredQuestions = allQuestions.filter(q => {
    const qDifficulty = q.difficulty?.toLowerCase() || 'medium';
    if (!selectedDifficulties.has(qDifficulty)) return false;
    if (selectedSubtopics.size > 0 && !selectedSubtopics.has(q.subtopic)) return false;
    return true;
  });

  const groupedQuestions = subtopics.reduce((acc, subtopic) => {
    acc[subtopic] = filteredQuestions.filter(q => q.subtopic === subtopic);
    return acc;
  }, {} as Record<string, Question[]>);

  const getDifficultyColor = (difficulty: string) => {
    const diff = difficulty?.toLowerCase() || 'medium';
    switch (diff) {
      case 'easy':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'hard':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const formatCorrectAnswer = (question: Question) => {
    if (!question.options || !question.correct_options) return 'N/A';
    
    const correctTexts = question.correct_options.map(idx => {
      const letter = String.fromCharCode(65 + idx); // A, B, C, D...
      return `${letter}. ${question.options[idx]}`;
    });
    
    return correctTexts.join(', ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading questions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-900">Failed to Load Questions</h3>
              <p className="text-red-700 text-sm mt-1">{error}</p>
              <p className="text-red-600 text-sm mt-2">
                Make sure you have uploaded a transcript and generated questions first.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (allQuestions.length === 0) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-blue-600" />
            <div>
              <h3 className="font-semibold text-blue-900">No Questions Available</h3>
              <p className="text-blue-700 text-sm mt-1">
                Upload a transcript from the Transcript Upload page to generate questions.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search questions..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-3">
          <button className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Regenerate Questions
          </button>
          <button className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export (CSV/PDF)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-8">
            <h3 className="font-semibold text-gray-900 mb-4">Filters</h3>

            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-3 block">
                  Subtopics
                </label>
                <div className="space-y-2">
                  {subtopics.map((subtopic) => (
                    <label key={subtopic} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSubtopics.size === 0 || selectedSubtopics.has(subtopic)}
                        onChange={() => toggleSubtopicFilter(subtopic)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 flex-1">{subtopic}</span>
                      <span className="text-xs text-gray-500 font-medium">({getSubtopicCount(subtopic)})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-3 block">
                  Difficulty
                </label>
                <div className="flex flex-wrap gap-2">
                  {['easy', 'medium', 'hard'].map((difficulty) => (
                    <button
                      key={difficulty}
                      onClick={() => toggleDifficulty(difficulty)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border capitalize ${
                        selectedDifficulties.has(difficulty)
                          ? getDifficultyColor(difficulty)
                          : 'bg-gray-50 text-gray-400 border-gray-200'
                      }`}
                    >
                      {difficulty}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Total: {allQuestions.length} questions across {subtopics.length} subtopics
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {subtopics.map((subtopic) => {
            const questions = groupedQuestions[subtopic];
            if (!questions || questions.length === 0) return null;

            const isExpanded = expandedSubtopics.has(subtopic);

            return (
              <div key={subtopic} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleSubtopic(subtopic)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                    <h3 className="font-semibold text-gray-900">{subtopic}</h3>
                    <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {questions.length}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-200">
                    {questions.map((question) => {
                      const questionId = String(question.id);
                      return (
                        <div
                          key={questionId}
                          className="p-6 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <p className="text-gray-900 flex-1 leading-relaxed">
                              {question.question}
                            </p>
                            <div className="flex items-center gap-2">
                              <button className="p-2 hover:bg-white rounded-lg transition-colors" title="Edit">
                                <Edit2 className="w-4 h-4 text-gray-400" />
                              </button>
                              <button className="p-2 hover:bg-white rounded-lg transition-colors" title="Duplicate">
                                <Copy className="w-4 h-4 text-gray-400" />
                              </button>
                              <button className="p-2 hover:bg-white rounded-lg transition-colors" title="Delete">
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mb-3 flex-wrap">
                            <span className={`px-3 py-1 rounded-lg text-xs font-medium border capitalize ${getDifficultyColor(question.difficulty)}`}>
                              {question.difficulty}
                            </span>
                            <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">
                              {question.subtopic}
                            </span>
                            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium capitalize">
                              {question.type}
                            </span>
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium">
                              {question.options?.length || 0} options
                            </span>
                          </div>

                          {/* Options preview */}
                          <div className="mt-3 mb-3">
                            {question.options && question.options.map((option, idx) => (
                              <div key={idx} className="flex items-start gap-2 py-1.5">
                                <span className="text-xs font-medium text-gray-500 mt-0.5">
                                  {String.fromCharCode(65 + idx)}.
                                </span>
                                <span className="text-sm text-gray-700">{option}</span>
                              </div>
                            ))}
                          </div>

                          {expandedAnswers.has(questionId) ? (
                            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                              <p className="text-sm font-medium text-gray-900 mb-2">Correct Answer:</p>
                              <p className="text-sm text-gray-700 mb-3">{formatCorrectAnswer(question)}</p>
                              {question.explanation && (
                                <>
                                  <p className="text-sm font-medium text-gray-900 mb-2">Explanation:</p>
                                  <p className="text-xs text-gray-600 italic">{question.explanation}</p>
                                </>
                              )}
                              <button
                                onClick={() => toggleAnswer(questionId)}
                                className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
                              >
                                Hide answer
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => toggleAnswer(questionId)}
                              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                              Show answer & explanation
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
