import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Edit2, Trash2, Check, Copy, Search, Save, Download, AlertCircle, Brain, X, CheckCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

import { API_BASE_URL } from "../config";

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
  chunk_index?: number;
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
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState<Set<string>>(new Set(['single', 'multiple']));
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set());
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<Partial<Question>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentQuestionSetId, setCurrentQuestionSetId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Fetch questions from backend API
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch question sets from backend
        const response = await fetch(`${API_BASE_URL}/api/question-sets`);
        
        if (!response.ok) {
          const text = await response.text();
          let errorMessage = `Failed to fetch questions: ${response.statusText}`;
          try {
            const errorData = JSON.parse(text);
            errorMessage = errorData.detail || errorMessage;
          } catch {
            errorMessage = text || errorMessage;
          }
          throw new Error(errorMessage);
        }
        
        const data = await response.json();
        const allSets = data.question_sets || [];
        
        // Get only the most recent question set (first one, since sorted by created_at desc)
        const latestSet = allSets.length > 0 ? [allSets[0]] : [];
        
        setQuestionSets(latestSet);
        
        // Store the current question set ID for updates
        if (latestSet.length > 0) {
          setCurrentQuestionSetId(latestSet[0]._id);
        }
        
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

  const showToastMessage = (message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

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

  const toggleQuestionType = (type: string) => {
    const newTypes = new Set(selectedQuestionTypes);
    if (newTypes.has(type)) {
      newTypes.delete(type);
    } else {
      newTypes.add(type);
    }
    setSelectedQuestionTypes(newTypes);
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

  // Edit question handler
  const handleEdit = (question: Question) => {
    setEditingQuestion(String(question.id));
    setEditedData({...question});
  };

  // Save edited question
  const handleSaveEdit = () => {
    if (!editingQuestion) return;
    
    setAllQuestions(prev => prev.map(q => 
      String(q.id) === editingQuestion 
        ? { ...q, ...editedData } as Question
        : q
    ));
    
    setEditingQuestion(null);
    setEditedData({});
    setHasChanges(true);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingQuestion(null);
    setEditedData({});
  };

  // Copy/Duplicate question
  const handleCopy = (question: Question) => {
    const newId = `${Date.now()}_${Math.random()}`;
    const copiedQuestion = {
      ...question,
      id: newId,
      question: `${question.question} (Copy)`
    };
    
    setAllQuestions(prev => [...prev, copiedQuestion]);
    setHasChanges(true);
  };

  // Delete question
  const handleDelete = (questionId: string | number) => {
    setAllQuestions(prev => prev.filter(q => String(q.id) !== String(questionId)));
    setHasChanges(true);
    showToastMessage('Question deleted successfully');
  };

  // Update questions in MongoDB
  const handleUpdateQuestions = async () => {
    if (!currentQuestionSetId) {
      showToastMessage('No question set found to update', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/question-sets/${currentQuestionSetId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          questions: allQuestions
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        let errorMessage = 'Failed to update questions';
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.detail || errorMessage;
        } catch {
          errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }

      setHasChanges(false);
      showToastMessage('Questions updated successfully!');
    } catch (err) {
      console.error('Error updating questions:', err);
      showToastMessage('Failed to update questions. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Navigate to AI Answering page
  const handleAIAnswering = () => {
    if (!currentQuestionSetId) {
      showToastMessage('No question set available', 'error');
      return;
    }
    
    // Store question set ID in localStorage for AI Answering page
    localStorage.setItem('ai_validation_question_set_id', currentQuestionSetId);
    
    // Trigger navigation to AI Quiz Answering page
    // This works by dispatching a custom event that App.tsx can listen to
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'ai-quiz' }));
  };

  // Export to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 15;
    let yPosition = margin;

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Question Bank', margin, yPosition);
    yPosition += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Questions: ${allQuestions.length}`, margin, yPosition);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin - 60, yPosition);
    yPosition += 15;

    // Questions
    filteredQuestions.forEach((q, index) => {
      // Check if we need a new page
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
      }

      // Question number and text
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      const questionText = `Q${index + 1}. ${q.question}`;
      const questionLines = doc.splitTextToSize(questionText, pageWidth - 2 * margin);
      doc.text(questionLines, margin, yPosition);
      yPosition += questionLines.length * 5 + 3;

      // Options
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      q.options?.forEach((opt, idx) => {
        if (yPosition > pageHeight - 30) {
          doc.addPage();
          yPosition = margin;
        }
        const cleanText = cleanOptionText(opt);
        const optionText = `  ${String.fromCharCode(65 + idx)}. ${cleanText}`;
        const optionLines = doc.splitTextToSize(optionText, pageWidth - 2 * margin - 5);
        doc.text(optionLines, margin + 5, yPosition);
        yPosition += optionLines.length * 4.5 + 2;
      });

      // Correct answer (replace \n with comma for PDF)
      doc.setFont('helvetica', 'italic');
      const correctAnswer = `Correct: ${formatCorrectAnswer(q).replace(/\n/g, ', ')}`;
      doc.text(correctAnswer, margin + 5, yPosition);
      yPosition += 6;

      // Metadata
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`Difficulty: ${q.difficulty} | Subtopic: ${q.subtopic}`, margin + 5, yPosition);
      doc.setTextColor(0);
      yPosition += 10;
    });

    doc.save(`question-bank-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const filteredQuestions = allQuestions.filter(q => {
    const qDifficulty = q.difficulty?.toLowerCase() || 'medium';
    if (!selectedDifficulties.has(qDifficulty)) return false;
    if (selectedSubtopics.size > 0 && !selectedSubtopics.has(q.subtopic)) return false;
    
    // Filter by question type
    const qType = q.type?.toLowerCase() || 'single';
    if (!selectedQuestionTypes.has(qType)) return false;
    
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

  // Clean option text by removing redundant prefixes like "A)", "1.", etc.
  const cleanOptionText = (text: string): string => {
    if (!text) return text;
    
    // Remove patterns like "A)", "B)", "1.", "2)", etc. from the start
    return text
      .replace(/^[A-Za-z]\)\s*/, '')  // Remove "A) ", "B) ", etc.
      .replace(/^[A-Za-z]\.\s*/, '')  // Remove "A. ", "B. ", etc.
      .replace(/^\d+\.\s*/, '')       // Remove "1. ", "2. ", etc.
      .replace(/^\d+\)\s*/, '')       // Remove "1) ", "2) ", etc.
      .trim();
  };

  const formatCorrectAnswer = (question: Question) => {
    if (!question.options || !question.correct_options) return 'N/A';
    
    const correctTexts = question.correct_options
      .filter(idx => idx >= 0 && idx < question.options.length) // Filter out invalid indices
      .map(idx => {
        const letter = String.fromCharCode(65 + idx); // A, B, C, D...
        const optionText = question.options[idx];
        if (!optionText) return null; // Skip if option is undefined
        const cleanText = cleanOptionText(optionText);
        return `${letter}. ${cleanText}`;
      })
      .filter(text => text !== null); // Remove null entries
    
    if (correctTexts.length === 0) return 'N/A';
    
    // Join with line breaks for multiple answers instead of comma
    return correctTexts.join('\n');
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
          <button 
            onClick={handleUpdateQuestions}
            disabled={!hasChanges || isSaving}
            className={`px-4 py-2.5 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 ${
              hasChanges && !isSaving
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Update Questions
                {hasChanges && <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">*</span>}
              </>
            )}
          </button>
          <button 
            onClick={handleAIAnswering}
            disabled={!currentQuestionSetId || hasChanges}
            className="px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title={hasChanges ? "Save changes before AI validation" : "Validate questions with AI"}
          >
            <Brain className="w-4 h-4" />
            AI Answering
          </button>
          <button 
            onClick={handleExportPDF}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export PDF
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

              <div>
                <label className="text-sm font-medium text-gray-700 mb-3 block">
                  Question Type
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => toggleQuestionType('single')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      selectedQuestionTypes.has('single')
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'bg-gray-50 text-gray-400 border-gray-200'
                    }`}
                  >
                    Single Correct
                  </button>
                  <button
                    onClick={() => toggleQuestionType('multiple')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      selectedQuestionTypes.has('multiple')
                        ? 'bg-purple-100 text-purple-700 border-purple-200'
                        : 'bg-gray-50 text-gray-400 border-gray-200'
                    }`}
                  >
                    Multiple Correct
                  </button>
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
                      const isEditing = editingQuestion === questionId;
                      
                      return (
                        <div
                          key={questionId}
                          className={`p-6 border-b border-gray-100 last:border-b-0 transition-colors ${
                            isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          {isEditing ? (
                            // EDIT MODE
                            <div className="space-y-4">
                              {/* Question Text */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Question:
                                </label>
                                <textarea
                                  value={editedData.question || ''}
                                  onChange={(e) => setEditedData({...editedData, question: e.target.value})}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  rows={3}
                                />
                              </div>

                              {/* Options */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Options:
                                </label>
                                {editedData.options?.map((opt, idx) => (
                                  <div key={idx} className="flex items-center gap-2 mb-2">
                                    <span className="text-sm font-medium text-gray-500 w-6">
                                      {String.fromCharCode(65 + idx)}.
                                    </span>
                                    <input
                                      type="text"
                                      value={opt}
                                      onChange={(e) => {
                                        const newOptions = [...(editedData.options || [])];
                                        newOptions[idx] = e.target.value;
                                        setEditedData({...editedData, options: newOptions});
                                      }}
                                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                    />
                                  </div>
                                ))}
                              </div>

                              {/* Correct Answer */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Correct Answer:
                                </label>
                                <select
                                  value={editedData.correct_options?.[0] || 0}
                                  onChange={(e) => setEditedData({...editedData, correct_options: [parseInt(e.target.value)]})}
                                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                  {editedData.options?.map((_, idx) => (
                                    <option key={idx} value={idx}>
                                      {String.fromCharCode(65 + idx)}. {editedData.options?.[idx]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Difficulty */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Difficulty:
                                </label>
                                <div className="flex gap-2">
                                  {['easy', 'medium', 'hard'].map((diff) => (
                                    <button
                                      key={diff}
                                      onClick={() => setEditedData({...editedData, difficulty: diff})}
                                      className={`px-4 py-2 rounded-lg text-sm font-medium border capitalize transition-colors ${
                                        editedData.difficulty === diff
                                          ? getDifficultyColor(diff)
                                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                      }`}
                                    >
                                      {diff}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex gap-2 pt-2">
                                <button
                                  onClick={handleSaveEdit}
                                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2"
                                >
                                  <Check className="w-4 h-4" />
                                  Save Changes
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium flex items-center gap-2"
                                >
                                  <X className="w-4 h-4" />
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            // VIEW MODE
                            <>
                              <div className="flex items-start justify-between gap-4 mb-3">
                                <p className="text-gray-900 flex-1 leading-relaxed">
                                  {question.question}
                                </p>
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => handleEdit(question)}
                                    className="p-2 hover:bg-white rounded-lg transition-colors" 
                                    title="Edit"
                                  >
                                    <Edit2 className="w-4 h-4 text-gray-400 hover:text-blue-600" />
                                  </button>
                                  <button 
                                    onClick={() => handleCopy(question)}
                                    className="p-2 hover:bg-white rounded-lg transition-colors" 
                                    title="Duplicate"
                                  >
                                    <Copy className="w-4 h-4 text-gray-400 hover:text-green-600" />
                                  </button>
                                  <button 
                                    onClick={() => handleDelete(question.id)}
                                    className="p-2 hover:bg-white rounded-lg transition-colors" 
                                    title="Delete"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
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
                                {question.options && question.options.map((option, idx) => {
                                  const cleanText = cleanOptionText(option);
                                  return (
                                    <div key={idx} className="flex items-start gap-2 py-1.5">
                                      <span className="text-xs font-medium text-gray-500 mt-0.5">
                                        {String.fromCharCode(65 + idx)}.
                                      </span>
                                      <span className="text-sm text-gray-700">{cleanText}</span>
                                    </div>
                                  );
                                })}
                              </div>

                              {expandedAnswers.has(questionId) ? (
                                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                                  <p className="text-sm font-medium text-gray-900 mb-2">Correct Answer:</p>
                                  <div className="text-sm text-gray-700 mb-3 whitespace-pre-line">{formatCorrectAnswer(question)}</div>
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
                            </>
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

      {/* Toast Notification */}
      {showToast && (
        <div className={`fixed bottom-8 right-8 ${
          toastType === 'success' ? 'bg-green-600' : 'bg-red-600'
        } text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slide-up z-50`}>
          <CheckCircle className="w-5 h-5" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
