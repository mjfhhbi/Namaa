import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register PWA service worker for offline caching and installation
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] New version available, updated in background.');
  },
  onOfflineReady() {
    console.log('[PWA] App is offline ready.');
  },
});

createRoot(document.getElementById('root')!).render(<App />);
