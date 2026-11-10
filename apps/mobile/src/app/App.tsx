import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { type LinkingOptions, NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setupNotifications } from '../services/notifications';
import { useAppStore } from '../store/appStore';
import { onLocalDataChanged } from '../utils/events';
import { logger } from '../utils/logger';
import { onAuthLost } from './container';
import { handleNotificationResponse, refreshDashboard, runBootstrap, syncNow } from './controller';
import { RootNavigator } from './navigation/RootNavigator';
import type { RootStackParamList } from './navigation/types';
import { darkTheme, lightTheme, navDark, navLight } from './theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

/** Deep links for activation / password reset (docs/API.md). */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'facultyattendance://'],
  config: {
    screens: {
      Activate: 'activate',
      ResetPassword: 'reset-password',
    },
  },
};

function useAppLifecycle() {
  useEffect(() => {
    setupNotifications().catch((e: unknown) => logger.warn('notification setup failed', e));
    void runBootstrap('APP_START');

    const unsubData = onLocalDataChanged(() => void refreshDashboard());
    const unsubAuth = onAuthLost(() => useAppStore.getState().setSignedOut('Your session expired. Please sign in again.'));

    // Re-validate on foreground: config version change → re-register geofence; sync the outbox.
    const appStateSub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && useAppStore.getState().authStatus === 'signedIn') void runBootstrap('FOREGROUND');
    });

    // Back online → sync (design §7.8).
    let wasOnline = true;
    const unsubNet = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      useAppStore.getState().setOnline(online);
      if (online && !wasOnline && useAppStore.getState().authStatus === 'signedIn') void syncNow();
      wasOnline = online;
    });

    // Notification buttons, including the response that launched the app from a killed state.
    const respSub = Notifications.addNotificationResponseReceivedListener((r) => void handleNotificationResponse(r));
    Notifications.getLastNotificationResponseAsync()
      .then((r) => (r ? handleNotificationResponse(r).then(() => Notifications.clearLastNotificationResponseAsync()) : undefined))
      .catch(() => undefined);

    return () => {
      unsubData();
      unsubAuth();
      appStateSub.remove();
      unsubNet();
      respSub.remove();
    };
  }, []);
}

export default function App() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  useAppLifecycle();

  return (
    <SafeAreaProvider>
      <PaperProvider
        theme={dark ? darkTheme : lightTheme}
        settings={{ icon: (props) => <MaterialCommunityIcons {...(props as React.ComponentProps<typeof MaterialCommunityIcons>)} /> }}
      >
        <QueryClientProvider client={queryClient}>
          <NavigationContainer linking={linking} theme={dark ? navDark : navLight}>
            <RootNavigator />
          </NavigationContainer>
          <StatusBar style={dark ? 'light' : 'dark'} />
        </QueryClientProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
