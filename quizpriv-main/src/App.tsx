import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { TranscriptUpload } from './pages/TranscriptUpload';
import { QuestionBank } from './pages/QuestionBank';
import { AIQuizAnswering } from './pages/AIQuizAnswering';

function App() {
  const [currentPage, setCurrentPage] = useState('upload');
  
  // Listen for navigation events from child components
  useEffect(() => {
    const handleNavigate = (event: CustomEvent) => {
      setCurrentPage(event.detail);
    };
    
    window.addEventListener('navigate', handleNavigate as EventListener);
    return () => window.removeEventListener('navigate', handleNavigate as EventListener);
  }, []);

  const getPageTitle = () => {
    switch (currentPage) {
      case 'upload':
        return 'Transcript Upload & Processing';
      case 'questions':
        return 'Question Bank';
      case 'ai-quiz':
        return 'AI Quiz Answering';
      default:
        return 'Dashboard';
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'upload':
        return <TranscriptUpload />;
      case 'questions':
        return <QuestionBank />;
      case 'ai-quiz':
        return <AIQuizAnswering />;
      default:
        return <TranscriptUpload />;
    }
  };

  return (
    <Layout
      pageTitle={getPageTitle()}
      currentPage={currentPage}
      onNavigate={setCurrentPage}
    >
      {renderPage()}
    </Layout>
  );
}

export default App;
