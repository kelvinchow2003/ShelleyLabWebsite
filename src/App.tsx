import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import {
  NavigationProvider,
  type PageKey,
} from './contexts/NavigationContext';
import { AuthPage } from './components/AuthPage';
import { Layout } from './components/Layout';
import { FullPageSpinner, Spinner } from './components/Spinner';

const Dashboard = lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.Dashboard }))
);
const Projects = lazy(() =>
  import('./pages/Projects').then((m) => ({ default: m.Projects }))
);
const Equipment = lazy(() =>
  import('./pages/Equipment').then((m) => ({ default: m.Equipment }))
);
const ActivityLog = lazy(() =>
  import('./pages/ActivityLog').then((m) => ({ default: m.ActivityLog }))
);
const DeletedProjects = lazy(() =>
  import('./pages/DeletedProjects').then((m) => ({ default: m.DeletedProjects }))
);
const ProjectDetail = lazy(() =>
  import('./components/ProjectDetail').then((m) => ({ default: m.ProjectDetail }))
);

function PageFallback() {
  return (
    <div className="flex justify-center py-20">
      <Spinner size={10} />
    </div>
  );
}

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
        <Suspense fallback={<PageFallback />}>
          {currentPage === 'home' && <Dashboard />}
          {currentPage === 'projects' && <Projects onOpenProject={viewProject} />}
          {currentPage === 'equipment' && <Equipment />}
          {currentPage === 'logs' && <ActivityLog />}
          {currentPage === 'deleted' && <DeletedProjects />}
        </Suspense>
      </Layout>
      {viewingProjectId && (
        <Suspense fallback={null}>
          <ProjectDetail
            projectId={viewingProjectId}
            onClose={() => setViewingProjectId(null)}
          />
        </Suspense>
      )}
    </NavigationProvider>
  );
}
