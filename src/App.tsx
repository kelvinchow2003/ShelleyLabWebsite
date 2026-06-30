import { useCallback, useMemo, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import {
  NavigationProvider,
  type PageKey,
} from './contexts/NavigationContext';
import { AuthPage } from './components/AuthPage';
import { Layout } from './components/Layout';
import { FullPageSpinner } from './components/Spinner';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { Equipment } from './pages/Equipment';
import { ActivityLog } from './pages/ActivityLog';
import { DeletedProjects } from './pages/DeletedProjects';
import { ProjectDetail } from './components/ProjectDetail';

export default function App() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageKey>('home');
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null);

  const navigateTo = useCallback((page: PageKey) => {
    setViewingProjectId(null);
    setCurrentPage(page);
  }, []);

  const viewProject = useCallback((projectId: string) => {
    setViewingProjectId(projectId);
  }, []);

  const navValue = useMemo(
    () => ({ currentPage, navigateTo, viewProject }),
    [currentPage, navigateTo, viewProject]
  );

  if (loading) return <FullPageSpinner />;
  if (!user) return <AuthPage />;

  return (
    <NavigationProvider value={navValue}>
      <Layout currentPage={currentPage} onNavigate={navigateTo}>
        {currentPage === 'home' && <Dashboard />}
        {currentPage === 'projects' && <Projects onOpenProject={viewProject} />}
        {currentPage === 'equipment' && <Equipment />}
        {currentPage === 'logs' && <ActivityLog />}
        {currentPage === 'deleted' && <DeletedProjects />}
      </Layout>
      {viewingProjectId && (
        <ProjectDetail
          projectId={viewingProjectId}
          onClose={() => setViewingProjectId(null)}
        />
      )}
    </NavigationProvider>
  );
}
