import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface LayoutProps {
  children: ReactNode;
  pageTitle: string;
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function Layout({ children, pageTitle, currentPage, onNavigate }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
      <div className="flex-1 flex flex-col">
        <TopBar pageTitle={pageTitle} />
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
