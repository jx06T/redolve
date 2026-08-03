import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { DashboardView } from './views/DashboardView';
import { StudyView } from './views/StudyView';
import { ProblemDetailView } from './views/ProblemDetailView';
import { SearchView } from './views/SearchView';
import { ShareView } from './views/ShareView';
import { SettingsView } from './views/SettingsView';
import { registerServiceWorker } from './services/swRegister';
import { initOnlineSync } from './services/offlineStorage';
import { updateProblemDrawData } from './services/api';

export default function App() {
  useEffect(() => {
    // Register PWA Service Worker
    registerServiceWorker();

    // Register Online Auto-Sync Handler
    initOnlineSync(async (item) => {
      try {
        const res = await updateProblemDrawData(item.id, item.drawData, item.seq);
        return res.status === 'ok';
      } catch {
        return false;
      }
    });
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#F4F4F2] dark:bg-[#161618] text-[#374151] dark:text-[#D1D5DB] transition-colors duration-200 flex flex-col font-sans">
        <Routes>
          {/* Public Share Route without main layout header */}
          <Route path="/share/:token" element={<ShareView />} />

          {/* Main App Routes */}
          <Route
            path="*"
            element={
              <>
                <Navbar />
                <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
                  <Routes>
                    <Route path="/" element={<DashboardView />} />
                    <Route path="/study" element={<Navigate to="/study/all" replace />} />
                    <Route path="/study/:topicId" element={<StudyView />} />
                    <Route path="/problem/:id" element={<ProblemDetailView />} />
                    <Route path="/search" element={<SearchView />} />
                    <Route path="/settings" element={<SettingsView />} />
                  </Routes>
                </main>
              </>
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
};
