import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Dashboard: undefined;
  History: undefined;
  Requests: undefined;
};

export type RootStackParamList = {
  // auth stack
  Login: undefined;
  ForgotPassword: undefined;
  Activate: { token?: string };
  ResetPassword: { token?: string };
  // onboarding
  Onboarding: undefined;
  Permissions: { fromOnboarding?: boolean } | undefined;
  // main
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  LocationMap: undefined;
  Settings: undefined;
  /** Session summary is passed along so the form can show it (mockup page 7) without another request. */
  Correction:
    | {
        sessionId?: string | null;
        workDate?: string;
        requestId?: string;
        checkInAt?: string | null;
        checkOutAt?: string | null;
        statusLabel?: string;
      }
    | undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
