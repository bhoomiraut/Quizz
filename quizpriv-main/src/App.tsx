import { useState } from 'react';
import { Layout } from './components/Layout';
import { TranscriptUpload } from './pages/TranscriptUpload';
import { QuestionBank } from './pages/QuestionBank';
import { AIQuizAnswering } from './pages/AIQuizAnswering';
import { PerformanceAnalytics } from './pages/PerformanceAnalytics';

function App() {
  const [currentPage, setCurrentPage] = useState('upload');

  const getPageTitle = () => {
    switch (currentPage) {
      case 'upload':
        return 'Transcript Upload & Processing';
      case 'questions':
        return 'Question Bank';
      case 'ai-quiz':
        return 'AI Quiz Answering';
      case 'analytics':
        return 'User Performance & Analytics';
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
      case 'analytics':
        return <PerformanceAnalytics />;
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
