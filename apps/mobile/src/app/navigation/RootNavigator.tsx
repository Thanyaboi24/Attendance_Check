import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ForgotPasswordScreen } from '../../features/auth/ForgotPasswordScreen';
import { LoginScreen } from '../../features/auth/LoginScreen';
import { SetPasswordScreen } from '../../features/auth/SetPasswordScreen';
import { CorrectionScreen } from '../../features/correction/CorrectionScreen';
import { DashboardScreen } from '../../features/dashboard/DashboardScreen';
import { RequestsScreen } from '../../features/correction/RequestsScreen';
import { HistoryScreen } from '../../features/history/HistoryScreen';
import { LocationMapScreen } from '../../features/locationMap/LocationMapScreen';
import { OnboardingScreen } from '../../features/onboarding/OnboardingScreen';
import { PermissionSetupScreen } from '../../features/onboarding/PermissionSetupScreen';
import { SettingsScreen } from '../../features/settings/SettingsScreen';
import { useAppStore } from '../../store/appStore';
import { palette } from '../theme';
import type { MainTabParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const tabIcon =
  (name: React.ComponentProps<typeof MaterialCommunityIcons>['name']) =>
  ({ color, size }: { color: string; size: number }) => <MaterialCommunityIcons name={name} color={color} size={size} />;

/** Home · History · Requests (mockups pages 3–6). Each tab draws its own title, so tab headers are hidden. */
function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.blue,
        tabBarInactiveTintColor: palette.textSoft,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarStyle: { paddingTop: 6, backgroundColor: palette.surface, borderTopColor: palette.border },
      }}
    >
      <Tabs.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Home', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="History" component={HistoryScreen} options={{ title: 'History', tabBarIcon: tabIcon('calendar-blank-outline') }} />
      <Tabs.Screen name="Requests" component={RequestsScreen} options={{ title: 'Requests', tabBarIcon: tabIcon('pencil-outline') }} />
    </Tabs.Navigator>
  );
}

/** Plain header matching the mockups' light background (back arrow + bold title). */
const plainHeader = {
  headerShadowVisible: false,
  headerStyle: { backgroundColor: palette.background },
  headerTitleStyle: { fontWeight: '700' as const, fontSize: 22, color: palette.text },
};

/** Auth stack / onboarding / main tabs, chosen from the session state. */
export function RootNavigator() {
  const authStatus = useAppStore((s) => s.authStatus);
  const onboarded = useAppStore((s) => s.onboarded);

  if (authStatus === 'unknown') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={plainHeader}>
      {authStatus === 'signedOut' ? (
        <Stack.Group>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Forgot password' }} />
          <Stack.Screen name="Activate" component={SetPasswordScreen} options={{ title: 'Activate account' }} />
          <Stack.Screen name="ResetPassword" component={SetPasswordScreen} options={{ title: 'Reset password' }} />
        </Stack.Group>
      ) : !onboarded ? (
        <Stack.Group>
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Permissions" component={PermissionSetupScreen} options={{ title: '' }} initialParams={{ fromOnboarding: true }} />
        </Stack.Group>
      ) : (
        <Stack.Group>
          <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="LocationMap" component={LocationMapScreen} options={{ title: 'Location', headerShown: false }} />
          <Stack.Screen name="Correction" component={CorrectionScreen} options={{ title: 'Request a correction' }} />
          <Stack.Screen name="Permissions" component={PermissionSetupScreen} options={{ title: '' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        </Stack.Group>
      )}
    </Stack.Navigator>
  );
}
