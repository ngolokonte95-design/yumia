import { useState, useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    // Fetch current state immediately
    NetInfo.fetch().then((state: NetInfoState) => {
      const connected = state.isConnected ?? true;
      setIsOnline(connected);
      if (!connected) setWasOffline(true);
    });

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected ?? true;
      if (!connected) setWasOffline(true);
      setIsOnline(connected);
    });

    return unsubscribe;
  }, []);

  return { isOnline, wasOffline };
}
