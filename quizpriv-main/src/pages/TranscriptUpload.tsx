import { useState, useEffect } from 'react';
import { Upload, FileText, Clock, Calendar, Tag, AlertCircle, CheckCircle, ChevronDown, ChevronUp, Loader } from 'lucide-react';

import { API_BASE_URL } from '../config';

export function TranscriptUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [preprocessTranscript, setPreprocessTranscript] = useState(false);
  const [questionType, setQuestionType] = useState<'single' | 'multiple' | 'mixed'>('single');
  const [singleCorrectPercentage, setSingleCorrectPercentage] = useState(50);
  const [numOptions, setNumOptions] = useState(4);
  const [numQuestions, setNumQuestions] = useState(40);
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preprocessedTranscript, setPreprocessedTranscript] = useState<string | null>(null);
  const [preprocessStats, setPreprocessStats] = useState<any>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [generatedData, setGeneratedData] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [hasGeneratedSession, setHasGeneratedSession] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load form state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('transcriptUploadState');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        setQuestionType(state.questionType || 'single');
        setSingleCorrectPercentage(state.singleCorrectPercentage || 50);
        setNumOptions(state.numOptions || 4);
        setNumQuestions(state.numQuestions || 40);
        setDifficulty(state.difficulty || 'Medium');
        setShowAdvancedOptions(state.showAdvancedOptions || false);
        setPreprocessTranscript(state.preprocessTranscript || false);
        
        // ONLY restore completed state if we have actual generated data
        // This prevents showing empty file names or incomplete states
        if (state.isCompleted && state.generatedData) {
          setIsCompleted(true);
          setGeneratedData(state.generatedData);
          setHasGeneratedSession(true);
          
          // Only restore file info if we have completed generation
          if (state.fileInfo) {
            const mockFile = new File([], state.fileInfo.name, { type: state.fileInfo.type });
            setFile(mockFile);
          }
          
          // Restore processing step only if completed
          if (state.processingStep !== undefined) {
            setProcessingStep(state.processingStep);
          }
          
          console.log('✅ Completed state restored:', {
            isCompleted: true,
            fileName: state.fileInfo?.name,
            totalQuestions: state.generatedData?.total_questions,
            processingStep: state.processingStep
          });
        } else {
          // If not completed or no data, ensure clean slate
          setIsCompleted(false);
          setGeneratedData(null);
          setFile(null);
          setProcessingStep(0);
          setHasGeneratedSession(false);
          console.log('📝 Clean slate - no completed generation found');
        }
        
        console.log('Restored form state from localStorage');
      } catch (e) {
        console.error('Failed to parse saved state:', e);
        // On error, clean slate
        localStorage.removeItem('transcriptUploadState');
      }
    }
    
    // 🔑 Mark hydration complete
    setIsHydrated(true);
  }, []);

  // Save form state to localStorage whenever it changes
  useEffect(() => {
    // ⛔ STOP EARLY SAVE - wait for hydration to complete
    if (!isHydrated) return;
    
    // Only save completion state if we actually have generated data
    const state = {
      questionType,
      singleCorrectPercentage,
      numOptions,
      numQuestions,
      difficulty,
      showAdvancedOptions,
      preprocessTranscript,
      isCompleted: isCompleted && generatedData ? true : false,
      hasGeneratedSession,
      processingStep: isCompleted && generatedData ? processingStep : 0,
      fileInfo: (isCompleted && generatedData && file) ? { name: file.name, type: file.type, size: file.size } : null,
      generatedData: generatedData || null
    };
    localStorage.setItem('transcriptUploadState', JSON.stringify(state));
    
    // Debug log when completion state changes
    if (isCompleted && generatedData) {
      console.log('💾 Saving completion state to localStorage:', {
        isCompleted,
        hasData: !!generatedData,
        fileName: file?.name,
        totalQuestions: generatedData?.total_questions
      });
    }
  }, [isHydrated, questionType, singleCorrectPercentage, numOptions, numQuestions, difficulty, showAdvancedOptions, preprocessTranscript, isCompleted, hasGeneratedSession, processingStep, file, generatedData]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.docx') || file.name.endsWith('.txt')) {
        setFile(file);
        setError(null);
      } else {
        setError('Please upload a .txt or .docx file');
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
      setPreprocessedTranscript(null);
      setPreprocessStats(null);
    }
  };

  const showToastMessage = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleGenerateQuestions = async () => {
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setProcessingStep(1);

    let progressInterval: NodeJS.Timeout | null = null;

    try {
      let fileToUse = file;
      
      // Preprocess if checkbox is enabled
      if (preprocessTranscript) {
        console.log('Preprocessing transcript...');
        const preprocessFormData = new FormData();
        preprocessFormData.append('file', file);

        const preprocessResponse = await fetch(`${API_BASE_URL}/api/preprocess`, {
          method: 'POST',
          body: preprocessFormData,
      });

        if (!preprocessResponse.ok) {
          const text = await preprocessResponse.text();
          let errorMessage = 'Failed to preprocess transcript';
          try {
            const errorData = JSON.parse(text);
            errorMessage = errorData.detail || errorMessage;
          } catch {
            errorMessage = text || errorMessage;
          }
          throw new Error(errorMessage);
        }

        const preprocessData = await preprocessResponse.json();
        setPreprocessedTranscript(preprocessData.cleaned_transcript);
        setPreprocessStats(preprocessData.stats);
        
        // Show toast for preprocessing completion
        showToastMessage('Preprocessing done!');
        
        // Create a new file with the cleaned transcript
        const cleanedBlob = new Blob([preprocessData.cleaned_transcript], { type: 'text/plain' });
        const originalName = file.name.replace(/\.(docx|txt)$/, '');
        fileToUse = new File([cleanedBlob], `${originalName}_cleaned.txt`, { type: 'text/plain' });
        
        console.log('Preprocessing complete:', preprocessData.stats);
        setProcessingStep(2);
      }

      const formData = new FormData();
      formData.append('file', fileToUse);

      console.log('Uploading file:', fileToUse.name);
      console.log('Advanced options:', { questionType, numOptions, numQuestions, difficulty });
      
      // Estimate chunks based on file size (chunk_size=6000 in backend)
      const estimatedChunks = Math.ceil(fileToUse.size / 6000) || 1;
      const totalSteps = estimatedChunks * 10; // 10 progress steps per chunk for smoothness
      const progressPerStep = 75 / totalSteps; // 75% for chunk processing (10% upload + 75% chunks + 15% final)
      
      console.log(`📊 Estimated chunks: ${estimatedChunks}, Total progress steps: ${totalSteps}`);
      
      // Start realistic progress simulation
      setProgress(0);
      let currentStep = 0;
      
      progressInterval = setInterval(() => {
        setProgress(prev => {
          // Upload phase (0-10%)
          if (prev < 10) {
            return prev + 1;
          }
          // Chunk processing phase (10-85%) - incremental steps
          else if (currentStep < totalSteps && prev < 85) {
            currentStep++;
            const chunkNumber = Math.ceil(currentStep / 10);
            if (currentStep % 10 === 0) {
              console.log(`✅ Chunk ${chunkNumber}/${estimatedChunks} completed - ${(10 + currentStep * progressPerStep).toFixed(1)}%`);
            }
            return 10 + (currentStep * progressPerStep);
          }
          // Final processing phase (85-95%)
          else if (prev < 95) {
            return prev + 0.3;
          }
          return prev;
        });
      }, 300); // Update every 300ms for smooth animation
      
      // Build query parameters for advanced options
      const queryParams = new URLSearchParams({
        question_type: questionType,
        num_options: numOptions.toString(),
        num_questions: numQuestions.toString(),
        difficulty: difficulty.toLowerCase()
      });
      
      // Add percentage for mixed mode
      if (questionType === 'mixed') {
        queryParams.append('single_correct_percentage', singleCorrectPercentage.toString());
      }
      
      const response = await fetch(`${API_BASE_URL}/api/generate-questions?${queryParams}`, {
        method: 'POST',
        body: formData,
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        const text = await response.text();
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.detail || errorMessage;
        } catch {
          errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }

      setProcessingStep(preprocessTranscript ? 3 : 2);
      const data = await response.json();
      console.log('Questions generated:', data.questions?.length || 0, 'questions');
      
      // Complete progress
      if (progressInterval) clearInterval(progressInterval);
      setProgress(100);
      
      // Store the generated questions and data
      localStorage.setItem('generatedQuestions', JSON.stringify(data.questions));
      
      // 🔥 CRITICAL: Save question_set_id for AI validation workflow
      if (data.question_set_id) {
        localStorage.setItem('ai_validation_question_set_id', data.question_set_id);
        console.log('✅ Saved question_set_id for AI validation:', data.question_set_id);
      }
      
      setGeneratedData(data);
      
      setProcessingStep(preprocessTranscript ? 4 : 3);
      setIsCompleted(true);
      setHasGeneratedSession(true);
      setError(null);
      showToastMessage(`✅ Generated ${data.total_questions} questions successfully!`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate questions';
      console.error('Error:', errorMessage);
      setError(errorMessage);
      setProcessingStep(0);
      if (progressInterval) clearInterval(progressInterval);
      setProgress(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadAgain = () => {
    console.log('🔄 Resetting state for new upload...');
    setFile(null);
    setIsCompleted(false);
    setGeneratedData(null);
    setHasGeneratedSession(false);
    setProcessingStep(0);
    setError(null);
    setPreprocessedTranscript(null);
    setPreprocessStats(null);
    setProgress(0);
    localStorage.removeItem('transcriptUploadState');
    localStorage.removeItem('generatedQuestions');
    showToastMessage('Ready for new upload');
  };

  const handleDownloadQuestions = () => {
    const questionsJson = localStorage.getItem('generatedQuestions');
    if (!questionsJson) {
      setError('No questions to download. Generate questions first.');
      return;
    }

    const questions = JSON.parse(questionsJson);
    const dataStr = JSON.stringify({ questions }, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quiz-questions-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const steps = [
    { label: 'Upload', icon: Upload },
    { label: 'Preprocess', icon: FileText },
    { label: 'Q&A Generation', icon: FileText },
    { label: 'Ready', icon: CheckCircle },
  ];

  // Debug render
  console.log('🎨 Rendering TranscriptUpload:', { hasGeneratedSession, isCompleted, hasData: !!generatedData, fileName: file?.name });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="text-gray-600">
          Upload a Teams meeting transcript (.txt or .docx) to generate quiz questions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {hasGeneratedSession && generatedData ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Questions Generated Successfully!</h3>
                    <p className="text-sm text-gray-600">Your quiz is ready in the Question Bank</p>
                  </div>
                </div>
                <button
                  onClick={handleUploadAgain}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload Again
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm text-blue-600 font-medium mb-1">Questions Generated</p>
                    <p className="text-2xl font-bold text-blue-900">{generatedData.total_questions}</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <p className="text-sm text-purple-600 font-medium mb-1">Subtopics Identified</p>
                    <p className="text-2xl font-bold text-purple-900">{generatedData.subtopics?.length || 0}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-sm text-green-600 font-medium mb-1">Chunks Processed</p>
                    <p className="text-2xl font-bold text-green-900">{generatedData.processed_chunks}</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-4">
                    <p className="text-sm text-orange-600 font-medium mb-1">Difficulty</p>
                    <p className="text-2xl font-bold text-orange-900 capitalize">{difficulty}</p>
                  </div>
                </div>

                {generatedData.subtopics && generatedData.subtopics.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 font-medium mb-3">Detected Subtopics:</p>
                    <div className="flex flex-wrap gap-2">
                      {generatedData.subtopics.map((topic: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-2">💡 <strong>What's next?</strong></p>
                  <ul className="text-sm text-gray-600 space-y-1 ml-4">
                    <li>• Navigate to <strong>Question Bank</strong> to review your questions</li>
                    <li>• Questions are organized by subtopics for easy browsing</li>
                    <li>• Export as CSV/PDF when ready</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              {/* File Upload Section */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                isDragging
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <Upload className="w-8 h-8 text-blue-600" />
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Drop your transcript here
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  or click to browse files
                </p>

                <label className="cursor-pointer">
                  <span className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-block text-sm font-medium">
                    Browse Files
                  </span>
                  <input
                    type="file"
                    accept=".txt,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>

                <p className="text-xs text-gray-400 mt-4">
                  Accepts .txt and .docx files
                </p>
              </div>
            </div>

            {file && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    Ready
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-red-900">Error</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            )}

            <div className="mt-8 space-y-3">
              <button
                onClick={handleGenerateQuestions}
                disabled={!file || isLoading}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Questions'
                )}
              </button>

              {(processingStep === 3 || processingStep === 4) && (
                <button
                  onClick={handleDownloadQuestions}
                  className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Upload className="w-5 h-5 rotate-180" />
                  Download Questions (JSON)
                </button>
              )}

              <button
                disabled={!file}
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="w-full px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                Advanced Options
                {showAdvancedOptions ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showAdvancedOptions && (
                <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg space-y-5">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preprocessTranscript}
                      onChange={(e) => setPreprocessTranscript(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Preprocess transcript
                    </span>
                  </label>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Type of Questions
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          checked={questionType === 'single'}
                          onChange={() => setQuestionType('single')}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                          Single Correct Answer
                        </span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          checked={questionType === 'multiple'}
                          onChange={() => setQuestionType('multiple')}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                          Multiple Correct Answers
                        </span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          checked={questionType === 'mixed'}
                          onChange={() => setQuestionType('mixed')}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                          Mixed (Both Types)
                        </span>
                      </label>
                    </div>
                    
                    {/* Percentage Slider for Mixed Mode */}
                    {questionType === 'mixed' && (
                      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <label className="text-sm font-medium text-gray-700 mb-3 block">
                          Question Distribution
                        </label>
                        <div className="space-y-3">
                          <div className="flex items-center gap-4">
                            <div className="flex-1">
                              <div className="flex justify-between text-xs text-gray-600 mb-2">
                                <span>Single Correct: {singleCorrectPercentage}%</span>
                                <span>Multiple Correct: {100 - singleCorrectPercentage}%</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="10"
                                value={singleCorrectPercentage}
                                onChange={(e) => setSingleCorrectPercentage(parseInt(e.target.value))}
                                className="w-full h-2 bg-gradient-to-r from-green-400 to-purple-400 rounded-lg appearance-none cursor-pointer"
                                style={{
                                  background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${singleCorrectPercentage}%, #c084fc ${singleCorrectPercentage}%, #c084fc 100%)`
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded">← Single</span>
                            <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">Multiple →</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Number of options per question
                    </label>
                    <div className="flex gap-2">
                      {[3, 4, 5].map((num) => (
                        <button
                          key={num}
                          onClick={() => setNumOptions(num)}
                          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            numOptions === num
                              ? 'bg-blue-600 text-white'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700">
                        Number of questions
                      </label>
                      <span className="text-sm font-semibold text-blue-600">
                        {numQuestions}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="30"
                      max="50"
                      value={numQuestions}
                      onChange={(e) => setNumQuestions(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>30</span>
                      <span>50</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700">
                        Difficulty level
                      </label>
                      <span className="text-sm font-semibold text-blue-600">
                        {difficulty}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {['Easy', 'Medium', 'Hard'].map((level) => (
                        <button
                          key={level}
                          onClick={() => setDifficulty(level as 'Easy' | 'Medium' | 'Hard')}
                          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            difficulty === level
                              ? 'bg-blue-600 text-white'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              Processing Status
            </h3>

            <div className="space-y-4">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const isActive = index === processingStep;
                const isCompleted = index < processingStep;
                const isQAGeneration = step.label === 'Q&A Generation';

                return (
                  <div key={step.label} className="space-y-2">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          isCompleted
                            ? 'bg-green-100 text-green-600'
                            : isActive
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {isActive && isQAGeneration ? (
                          <Loader className="w-5 h-5 animate-spin" />
                        ) : (
                          <Icon className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p
                          className={`font-medium ${
                            isActive || isCompleted ? 'text-gray-900' : 'text-gray-400'
                          }`}
                        >
                          {step.label}
                        </p>
                      </div>
                      {isCompleted && (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      )}
                    </div>
                    
                    {/* Progress bar for Q&A Generation */}
                    {isActive && isQAGeneration && progress > 0 && (
                      <div className="ml-14 mr-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600">Generating questions...</span>
                          <span className="text-xs font-semibold text-blue-600">{Math.round(progress)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          {preprocessedTranscript && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Preprocessed Transcript
              </h3>
              
              {preprocessStats && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Lines removed:</span>
                    <span className="font-semibold text-gray-900">
                      {preprocessStats.lines_removed} ({preprocessStats.line_reduction_percent}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Words removed:</span>
                    <span className="font-semibold text-gray-900">
                      {preprocessStats.words_removed} ({preprocessStats.word_reduction_percent}%)
                    </span>
                  </div>
                </div>
              )}
              
              <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                  {preprocessedTranscript}
                </pre>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-8">
            <h3 className="font-semibold text-gray-900 mb-4">Transcript Info</h3>

            {file ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide">
                    Name
                  </label>
                  <p className="text-sm text-gray-900 mt-1 font-medium">
                    {file.name.replace(/\.(docx|txt)$/, '')}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>Dec 15, 2024</span>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4" />
                  <span>45 minutes</span>
                </div>

                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-2">
                    <Tag className="w-3 h-3" />
                    Detected Topics
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['Project Overview', 'Architecture', 'Timeline', 'Resources'].map(
                      (topic) => (
                        <span
                          key={topic}
                          className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"
                        >
                          {topic}
                        </span>
                      )
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <label className="text-xs text-gray-500 uppercase tracking-wide mb-2 block">
                    Summary
                  </label>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Discussion covered project architecture, implementation timeline, and resource allocation for the AI quiz generation system. Key focus areas included Python environment setup, Langsmith integration, and AWS deployment strategy.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">
                  Upload a file to view transcript info
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-8 right-8 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slide-up z-50">
          <CheckCircle className="w-5 h-5" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
