import { useState, useEffect } from 'react';

/**
 * Custom hook to track online/offline status
 * Uses browser's navigator.onLine and event listeners
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log('[Network] Back online');
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log('[Network] Gone offline');
    };

    // Listen to browser online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen to service worker messages
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'ONLINE_STATUS') {
          setIsOnline(event.data.online);
        }
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export default useOnlineStatus;
