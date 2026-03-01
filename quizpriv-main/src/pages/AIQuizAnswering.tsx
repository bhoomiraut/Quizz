import { useState, useEffect } from 'react';
import { Brain, AlertTriangle, AlertCircle, CheckCircle, XCircle, RefreshCw, Flag, TrendingUp, TrendingDown, Minus } from 'lucide-react';

import { API_BASE_URL } from "../config";

interface ValidationResult {
  question_id: string;
  question: string;
  options?: string[];
  model_used: string;
  ai_selected: string[];
  correct_answer: string[];
  confidence: number;
  reasoning: string;
  ambiguity_flag: boolean;
  difficulty_estimate: string;
  quality_score: number;
  answer_accuracy: number;
  option_quality: number;
  difficulty_match: number;
  error?: string;
  question_type_issue?: string;
}

interface ValidationResponse {
  success: boolean;
  model_used: string;
  total_questions: number;
  average_quality: number;
  results: ValidationResult[];
}

export function AIQuizAnswering() {
  const [questionSetId, setQuestionSetId] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [selectedModel, setSelectedModel] = useState('llama-3.1-8b-instant');
  const [validationData, setValidationData] = useState<ValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'low' | 'flagged' | 'high' | 'medium'>('all');
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [focusedQuestion, setFocusedQuestion] = useState<ValidationResult | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const availableModels = [
    { id: 'llama-3.1-8b-instant', name: 'LLaMA 3.1 8B', provider: 'Groq', badge: 'Fast', badgeColor: 'bg-blue-100 text-blue-700', description: 'Quick validation for large question sets' },
    { id: 'llama-3.3-70b-versatile', name: 'LLaMA 3.3 70B', provider: 'Groq', badge: 'Accurate', badgeColor: 'bg-green-100 text-green-700', description: 'High-quality grading & reasoning' },
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', provider: 'Groq', badge: 'Advanced', badgeColor: 'bg-purple-100 text-purple-700', description: 'Superior reasoning capabilities' },
    { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2 Instruct', provider: 'Groq', badge: '262k Context', badgeColor: 'bg-indigo-100 text-indigo-700', description: 'Perfect for long transcripts & lectures' },
    { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', provider: 'Groq', badge: 'Versatile', badgeColor: 'bg-teal-100 text-teal-700', description: 'Strong general performance' },
    { id: 'meta-llama/llama-guard-4-12b', name: 'LLaMA Guard 4 12B', provider: 'Groq', badge: 'Safety', badgeColor: 'bg-orange-100 text-orange-700', description: 'Content moderation & filtering' },
    { id: 'openai/gpt-oss-safeguard-20b', name: 'GPT OSS Safeguard', provider: 'Groq', badge: 'Safety', badgeColor: 'bg-red-100 text-red-700', description: 'Safety guardrails' },
  ];

  // Load saved validation state on mount
  useEffect(() => {
    // Get question set ID from localStorage
    const storedId = localStorage.getItem('ai_validation_question_set_id');
    if (storedId) {
      setQuestionSetId(storedId);
    }

    // Restore validation data and other state
    const savedState = localStorage.getItem('aiValidationState');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        if (state.validationData) {
          setValidationData(state.validationData);
        }
        if (state.selectedModel) {
          setSelectedModel(state.selectedModel);
        }
        if (state.flaggedQuestions) {
          setFlaggedQuestions(new Set(state.flaggedQuestions));
        }
        console.log('✅ Restored AI validation state from localStorage');
      } catch (e) {
        console.error('Failed to parse saved validation state:', e);
        localStorage.removeItem('aiValidationState');
      }
    }

    setIsHydrated(true);
  }, []);

  // Save validation state to localStorage whenever it changes
  useEffect(() => {
    if (!isHydrated) return;

    const state = {
      validationData,
      selectedModel,
      flaggedQuestions: Array.from(flaggedQuestions),
    };

    localStorage.setItem('aiValidationState', JSON.stringify(state));
  }, [isHydrated, validationData, selectedModel, flaggedQuestions]);

  useEffect(() => {
    // Auto-hide toast after 5 seconds
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    // ESC key to close focus modal
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocusedQuestion(null);
    };
    window.addEventListener('keydown', escHandler);
    return () => window.removeEventListener('keydown', escHandler);
  }, []);

  const handleValidate = async () => {
    try {
      setValidating(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/api/ai-validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_set_id: questionSetId,
          model_name: selectedModel,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        let errorMessage = 'Validation failed';
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.detail || errorMessage;
        } catch {
          errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data: ValidationResponse = await response.json();
      setValidationData(data);

    } catch (err) {
      console.error('Validation error:', err);
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setValidating(false);
    }
  };



  const getQualityColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getAccuracyStatus = (result: ValidationResult) => {
    const aiSet = new Set(result.ai_selected);
    const correctSet = new Set(result.correct_answer);
    const intersection = [...aiSet].filter(x => correctSet.has(x)).length;

    if (intersection === correctSet.size && aiSet.size === correctSet.size) {
      return { label: 'Correct', color: 'text-green-600 bg-green-50' };
    } else if (intersection > 0) {
      return { label: 'Partial', color: 'text-yellow-600 bg-yellow-50' };
    } else {
      return { label: 'Incorrect', color: 'text-red-600 bg-red-50' };
    }
  };

  const getFailureReason = (result: ValidationResult) => {
    if (result.answer_accuracy === 0 && result.confidence > 0.7) return { label: "Confident but Incorrect", color: "bg-red-100 text-red-700" };
    if (result.answer_accuracy > 0 && result.answer_accuracy < 1) return { label: "Partial / Ambiguous", color: "bg-yellow-100 text-yellow-700" };
    if (result.ambiguity_flag) return { label: "Ambiguous Wording", color: "bg-orange-100 text-orange-700" };
    if ((result as any).question_type_issue) return { label: "Context Dependent", color: "bg-amber-100 text-amber-700" };
    return null;
  };

  const toggleFlag = (questionId: string) => {
    const newFlagged = new Set(flaggedQuestions);
    if (newFlagged.has(questionId)) {
      newFlagged.delete(questionId);
    } else {
      newFlagged.add(questionId);
    }
    setFlaggedQuestions(newFlagged);
  };

  // Filter results based on selected filter
  const filteredResults = validationData?.results.filter(r => {
    if (filter === 'low') return r.quality_score < 0.6;
    if (filter === 'flagged') return flaggedQuestions.has(r.question_id);
    if (filter === 'high') return r.quality_score >= 0.8;
    if (filter === 'medium') return r.quality_score >= 0.6 && r.quality_score < 0.8;
    return true;
  }) || [];

  // Calculate stats
  const stats = validationData ? {
    high: validationData.results.filter(r => r.quality_score >= 0.8).length,
    medium: validationData.results.filter(r => r.quality_score >= 0.6 && r.quality_score < 0.8).length,
    low: validationData.results.filter(r => r.quality_score < 0.6).length,
  } : null;

  // Metric Bar Component
  const MetricBar = ({ label, value, weight }: { label: string; value: number; weight?: string }) => (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <span className="text-xs text-gray-600">{(value * 100).toFixed(0)}% {weight && <span className="text-gray-400">({weight})</span>}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className={`h-2 rounded-full transition-all ${
            value >= 0.8 ? 'bg-green-500' : value >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );

  // Option Styling Helper
  const getOptionStyle = (
    option: string,
    result: ValidationResult
  ) => {
    if (result.correct_answer?.includes(option)) {
      return 'bg-green-100 border-green-300';
    }

    if (result.ai_selected?.includes(option)) {
      return 'bg-blue-100 border-blue-300';
    }

    return 'bg-gray-50 border-gray-200';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Brain className="w-8 h-8 text-purple-600" />
                AI Question Validation
              </h1>
              <p className="text-gray-600 mt-2">
                Single-model blind evaluation of question quality
              </p>
            </div>

            {validationData && (
              <button
                onClick={() => {
                  setValidationData(null);
                  setFlaggedQuestions(new Set());
                  setFilter('all');
                  setFocusedQuestion(null);
                }}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 shadow-sm"
              >
                <RefreshCw className="w-5 h-5" />
                Validate Again
              </button>
            )}
          </div>
        </div>

        {/* No Question Set Warning */}
        {!questionSetId && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
              <h2 className="text-xl font-semibold text-yellow-900">No Question Set Selected</h2>
            </div>
            <p className="text-yellow-700">
              Please go to the Question Bank page and click "AI Answering" button to validate questions.
            </p>
          </div>
        )}

        {/* Model Selection & Validation */}
        {questionSetId && !validationData && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6"
>
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Select AI Model</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {availableModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={`p-5 rounded-xl border-2 text-left transition-all hover:shadow-lg ${
                    selectedModel === model.id
                      ? 'border-purple-600 bg-purple-50 shadow-md ring-2 ring-purple-200'
                      : 'border-gray-200 hover:border-purple-300 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 mb-1">{model.name}</div>
                      <div className="text-xs text-gray-500">{model.provider}</div>
                    </div>
                    <span className={`px-2 py-1 rounded-md text-xs font-semibold ${model.badgeColor} ml-2 whitespace-nowrap`}>
                      {model.badge}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{model.description}</p>
                </button>
              ))}
            </div>

            <button
              onClick={handleValidate}
              disabled={validating}
              className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-lg font-medium flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {validating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Validating Questions...
                </>
              ) : (
                <>
                  <Brain className="w-5 h-5" />
                  Start AI Validation
                </>
              )}
            </button>

            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 max-w-md px-6 py-4 rounded-lg shadow-lg border-2 animate-slide-in ${
            toast.type === 'success' ? 'bg-green-50 border-green-500 text-green-900' :
            toast.type === 'error' ? 'bg-red-50 border-red-500 text-red-900' :
            'bg-blue-50 border-blue-500 text-blue-900'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">{toast.message}</p>
              <button
                onClick={() => setToast(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Validation Results */}
        {validationData && (
          <div className="space-y-4">
            {/* Quality Overview Panel */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-sm border-2 border-green-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-gray-700">High Quality</div>
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-3xl font-bold text-green-600">{stats?.high}</div>
                <div className="text-xs text-gray-600 mt-1">≥80% • Ready to use</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border-2 border-yellow-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-gray-700">Medium Quality</div>
                  <Minus className="w-5 h-5 text-yellow-600" />
                </div>
                <div className="text-3xl font-bold text-yellow-600">{stats?.medium}</div>
                <div className="text-xs text-gray-600 mt-1">60-79% • Minor fixes</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border-2 border-red-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-gray-700">Low Quality</div>
                  <TrendingDown className="w-5 h-5 text-red-600" />
                </div>
                <div className="text-3xl font-bold text-red-600">{stats?.low}</div>
                <div className="text-xs text-gray-600 mt-1">&lt;60% • Needs attention</div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-700">Quick Filters:</span>
                  <button
                    onClick={() => setFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      filter === 'all'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    All ({validationData.total_questions})
                  </button>
                  <button
                    onClick={() => setFilter('high')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      filter === 'high'
                        ? 'bg-green-600 text-white'
                        : 'bg-green-50 text-green-700 hover:bg-green-100'
                    }`}
                  >
                    High Quality ({stats?.high})
                  </button>
                  <button
                    onClick={() => setFilter('medium')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      filter === 'medium'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                    }`}
                  >
                    Medium Quality ({stats?.medium})
                  </button>
                  <button
                    onClick={() => setFilter('low')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      filter === 'low'
                        ? 'bg-red-600 text-white'
                        : 'bg-red-50 text-red-700 hover:bg-red-100'
                    }`}
                  >
                    Low Quality ({stats?.low})
                  </button>
                  <button
                    onClick={() => setFilter('flagged')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      filter === 'flagged'
                        ? 'bg-red-600 text-white'
                        : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                    }`}
                  >
                    Flagged ({flaggedQuestions.size})
                  </button>
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-900">{filteredResults.length}</span> questions
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Validation Results</h2>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Model Used</div>
                  <div className="font-semibold text-gray-900">{validationData.model_used}</div>
                </div>
                <div>
                  <div className="text-gray-600">Total Questions</div>
                  <div className="font-semibold text-gray-900">{validationData.total_questions}</div>
                </div>
                <div>
                  <div className="text-gray-600">High Quality (≥80%)</div>
                  <div className="font-semibold text-gray-900">
                    {validationData.results.filter(r => r.quality_score >= 0.8).length}
                  </div>
                </div>
              </div>
            </div>

            {/* Question Cards Grid - Triage View */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredResults && filteredResults.map((result, idx) => {
                const accuracyStatus = getAccuracyStatus(result);
                const failureReason = getFailureReason(result);
                const isFlagged = flaggedQuestions.has(result.question_id);

                return (
                  <div
                    key={result.question_id}
                    onClick={() => setFocusedQuestion(result)}
                    className={`bg-white rounded-xl shadow-sm border-2 p-5 hover:shadow-md transition-all cursor-pointer ${
                      isFlagged ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-900">
                        #{idx + 1}
                      </span>
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${getQualityColor(result.quality_score)}`}>
                        {(result.quality_score * 100).toFixed(0)}%
                      </span>
                    </div>

                    {/* Question Text */}
                    <p className="text-sm font-medium text-gray-900 mb-3 line-clamp-3 leading-relaxed">
                      {result.question}
                    </p>

                    {/* Key Metrics */}
                    <div className="flex justify-between text-xs text-gray-600 mb-3">
                      <span className={`font-semibold ${accuracyStatus.color.split(' ')[0]}`}>
                        {accuracyStatus.label}
                      </span>
                      <span>
                        Conf: <span className="font-semibold">{(result.confidence * 100).toFixed(0)}%</span>
                      </span>
                    </div>

                    {/* Status Badges */}
                    <div className="flex gap-2 flex-wrap">
                      {isFlagged && (
                        <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded font-medium flex items-center gap-1">
                          <Flag className="w-3 h-3" />
                          Flagged
                        </span>
                      )}
                      {failureReason && (
                        <span className={`px-2 py-1 text-xs rounded font-medium ${failureReason.color}`}>
                          {failureReason.label.split(' / ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Focus Modal for Deep Analysis */}
            {focusedQuestion && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                onClick={() => setFocusedQuestion(null)}
              >
                {/* Modal Container */}
                <div
                  className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900 mb-1">
                        Question Review
                      </h2>
                      <p className="text-sm text-gray-600">
                        AI-driven validation breakdown
                      </p>
                    </div>
                    <button
                      onClick={() => setFocusedQuestion(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <XCircle className="w-6 h-6" />
                    </button>
                  </div>

                  {/* Body */}
                  <div className="p-6 space-y-6">
                    {/* Question */}
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getQualityColor(focusedQuestion.quality_score)}`}>
                          {(focusedQuestion.quality_score * 100).toFixed(0)}% Quality
                        </span>
                        {focusedQuestion.ambiguity_flag && (
                          <span className="px-3 py-1 rounded-full text-sm bg-orange-100 text-orange-700 font-semibold">
                            Ambiguous
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-medium text-gray-900 leading-relaxed">
                        {focusedQuestion.question}
                      </p>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs text-gray-600 mb-1">Confidence</div>
                        <div className="text-lg font-bold text-gray-900">{(focusedQuestion.confidence * 100).toFixed(0)}%</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs text-gray-600 mb-1">Difficulty</div>
                        <div className="text-lg font-bold text-gray-900 capitalize">{focusedQuestion.difficulty_estimate}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs text-gray-600 mb-1">Status</div>
                        <div className={`text-sm font-bold ${getAccuracyStatus(focusedQuestion).color.split(' ')[0]}`}>
                          {getAccuracyStatus(focusedQuestion).label}
                        </div>
                      </div>
                    </div>

                    {/* Options */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">
                        Options
                      </h4>

                      <div className="space-y-2">
                        {['A', 'B', 'C', 'D'].map((opt, index) => (
                          <div
                            key={opt}
                            className={`px-3 py-2 rounded-lg border text-sm flex gap-2 ${getOptionStyle(opt, focusedQuestion)}`}
                          >
                            <span className="font-semibold">{opt}.</span>
                            <span>
                              {focusedQuestion.options?.[index] || `Option ${opt}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* AI vs Correct */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                          AI Selected
                        </h4>
                        {focusedQuestion.ai_selected && focusedQuestion.ai_selected.length ? (
                          focusedQuestion.ai_selected.map(opt => (
                            <div key={opt} className="mb-1 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-sm">
                              {opt}
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-gray-500 px-3 py-2 bg-gray-50 border border-gray-200 rounded">No selection</div>
                        )}
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                          Correct Answer
                        </h4>
                        {focusedQuestion.correct_answer && focusedQuestion.correct_answer.length ? (
                          focusedQuestion.correct_answer.map(opt => (
                            <div key={opt} className="mb-1 px-3 py-2 bg-green-50 border border-green-200 rounded text-sm">
                              {opt}
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-gray-500 px-3 py-2 bg-gray-50 border border-gray-200 rounded">No answer</div>
                        )}
                      </div>
                    </div>

                    {/* Reasoning */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">
                        AI Reasoning
                      </h4>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 leading-relaxed">
                        {focusedQuestion.reasoning}
                      </div>
                    </div>

                    {/* Metrics */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">
                        Quality Breakdown
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <MetricBar label="Answer Accuracy" value={focusedQuestion.answer_accuracy} weight="45%" />
                        <MetricBar label="Confidence" value={focusedQuestion.confidence} weight="20%" />
                        <MetricBar label="Option Quality" value={focusedQuestion.option_quality} weight="15%" />
                        <MetricBar label="Difficulty Match" value={focusedQuestion.difficulty_match} weight="10%" />
                      </div>
                    </div>

                    {/* Question Type Issue */}
                    {(focusedQuestion as any).question_type_issue && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <h5 className="text-sm font-semibold text-amber-900 mb-1">
                              ⚠️ Question Type Issue
                            </h5>
                            <p className="text-sm text-amber-700">
                              {(focusedQuestion as any).question_type_issue}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                      <button
                        onClick={() => {
                          toggleFlag(focusedQuestion.question_id);
                        }}
                        className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
                          flaggedQuestions.has(focusedQuestion.question_id)
                            ? 'bg-red-100 text-red-700 border-2 border-red-300'
                            : 'bg-red-50 text-red-700 hover:bg-red-100'
                        }`}
                      >
                        <Flag className="w-4 h-4" />
                        {flaggedQuestions.has(focusedQuestion.question_id) ? 'Unflag Question' : 'Flag for Manual Review'}
                      </button>

                      <button
                        onClick={() => setFocusedQuestion(null)}
                        className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
