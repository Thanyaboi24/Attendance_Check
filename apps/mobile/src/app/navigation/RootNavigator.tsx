import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { ForgotPasswordScreen } from '../../features/auth/ForgotPasswordScreen';
import { LoginScreen } from '../../features/auth/LoginScreen';
import { SetPasswordScreen } from '../../features/auth/SetPasswordScreen';
import { SignUpScreen } from '../../features/auth/SignUpScreen';
import { SignUpSubmittedScreen } from '../../features/auth/SignUpSubmittedScreen';
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
  const { t } = useTranslation();
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
      <Tabs.Screen name="Dashboard" component={DashboardScreen} options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="History" component={HistoryScreen} options={{ title: t('tabs.history'), tabBarIcon: tabIcon('calendar-blank-outline') }} />
      <Tabs.Screen name="Requests" component={RequestsScreen} options={{ title: t('tabs.requests'), tabBarIcon: tabIcon('pencil-outline') }} />
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
  const { t } = useTranslation();

  if (authStatus === 'unknown') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" accessibilityLabel={t('loading')} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={plainHeader}>
      {authStatus === 'signedOut' ? (
        <Stack.Group>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: t('screens.signUp') }} />
          <Stack.Screen name="SignUpSubmitted" component={SignUpSubmittedScreen} options={{ title: t('screens.signUpSubmitted'), headerBackVisible: false, gestureEnabled: false }} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: t('screens.forgotPassword') }} />
          <Stack.Screen name="Activate" component={SetPasswordScreen} options={{ title: t('screens.activate') }} />
          <Stack.Screen name="ResetPassword" component={SetPasswordScreen} options={{ title: t('screens.resetPassword') }} />
        </Stack.Group>
      ) : !onboarded ? (
        <Stack.Group>
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Permissions" component={PermissionSetupScreen} options={{ title: '' }} initialParams={{ fromOnboarding: true }} />
        </Stack.Group>
      ) : (
        <Stack.Group>
          <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="LocationMap" component={LocationMapScreen} options={{ title: t('screens.location'), headerShown: false }} />
          <Stack.Screen name="Correction" component={CorrectionScreen} options={{ title: t('screens.correction') }} />
          <Stack.Screen name="Permissions" component={PermissionSetupScreen} options={{ title: '' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('screens.settings') }} />
        </Stack.Group>
      )}
    </Stack.Navigator>
  );
}
