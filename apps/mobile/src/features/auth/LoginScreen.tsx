import { LoginRequestSchema } from '@attendance/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View, type TextInputInstance as NativeTextInput } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { getDeps } from '../../app/container';
import { refreshDashboard } from '../../app/controller';
import type { RootStackParamList } from '../../app/navigation/types';
import { palette } from '../../app/theme';
import { BigButton, Notice, Panel } from '../../ui/kit';
import { validationMessage } from '../../domain/errors';
import { adminWebMessage, login } from '../../domain/useCases/auth';
import { META_ONBOARDED } from '../../domain/useCases/common';
import { useAppStore } from '../../store/appStore';

/** Message under the form: an error (red) or an account-state notice (amber), optionally with a sign-up link. */
type LoginMessage = { text: string; tone: 'error' | 'info'; signUpAgain?: boolean };

/** Mockup page 1: institutional email, password, error area, Log in, Forgot password, plus self sign-up. */
export function LoginScreen() {
  const { t } = useTranslation(['auth', 'errors', 'common']);
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Login'>>();
  const notStaffMessage = useAppStore((s) => s.notStaffMessage);
  const prefillEmail = route.params?.email;
  const [email, setEmail] = useState(prefillEmail ?? '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<LoginMessage | null>(null);
  const setError = (text: string | null) => setMessage(text == null ? null : { text, tone: 'error' });
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = React.useRef<NativeTextInput>(null);

  // Back from "Request sent": prefill the email that was just registered.
  useEffect(() => {
    if (prefillEmail) {
      setEmail(prefillEmail);
      setMessage(null);
    }
  }, [prefillEmail]);

  async function onSubmit() {
    setError(null);
    const parsed = LoginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(validationMessage(parsed.error.issues[0]?.message, t('login.enterEmailPassword')));
      return;
    }
    setBusy(true);
    try {
      const deps = await getDeps();
      const out = await login(deps, parsed.data.email, parsed.data.password);
      const store = useAppStore.getState();
      switch (out.kind) {
        case 'OK':
          store.setOnboarded((await deps.store.getMeta(META_ONBOARDED)) === '1');
          store.setMonitoring(out.monitoring);
          store.setSignedIn(out.user);
          await refreshDashboard();
          return;
        case 'NOT_STAFF':
          store.setSignedOut(adminWebMessage());
          return;
        case 'INVALID_CREDENTIALS':
          // Generic: never reveals whether the email exists.
          setError(t('login.invalidCredentials'));
          return;
        case 'ACCOUNT_LOCKED':
          setError(t('login.locked'));
          return;
        case 'ACCOUNT_INACTIVE':
          setError(t('login.inactive'));
          return;
        case 'ACCOUNT_PENDING_APPROVAL':
          setMessage({ text: t('login.pendingApproval'), tone: 'info' });
          return;
        case 'ACCOUNT_REJECTED':
          setMessage({
            text: [t('login.rejected'), out.reason ? t('login.rejectedReason', { reason: out.reason }) : null, t('login.rejectedHint')]
              .filter(Boolean)
              .join('\n'),
            tone: 'error',
            signUpAgain: true,
          });
          return;
        case 'NETWORK':
          setError(t('login.network'));
          return;
        case 'ERROR':
          setError(out.message);
          return;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: palette.background }} behavior="height">
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <MaterialCommunityIcons name="map-marker-check-outline" size={44} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>{t('login.title')}</Text>
        <Text style={styles.subtitle}>{t('common:appName')}</Text>

        {notStaffMessage ? <Notice tone="amber">{notStaffMessage}</Notice> : null}

        <Panel style={styles.form}>
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>{t('login.email')}</Text>
            <TextInput
              accessibilityLabel={t('login.email')}
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
              mode="outlined"
              outlineStyle={styles.inputOutline}
              style={styles.input}
            />
          </View>
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>{t('login.password')}</Text>
            <TextInput
              ref={passwordRef}
              accessibilityLabel={t('login.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="password"
              mode="outlined"
              outlineStyle={styles.inputOutline}
              style={styles.input}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  accessibilityLabel={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  onPress={() => setShowPassword((v) => !v)}
                />
              }
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
            />
          </View>
          {message ? (
            <View style={[styles.error, message.tone === 'info' && styles.info]} accessibilityLiveRegion="polite">
              <MaterialCommunityIcons
                name={message.tone === 'info' ? 'clock-outline' : 'alert-circle-outline'}
                size={22}
                color={message.tone === 'info' ? '#C2410C' : '#B91C1C'}
              />
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={[styles.errorText, message.tone === 'info' && styles.infoText]}>{message.text}</Text>
                {message.signUpAgain ? (
                  <Pressable
                    onPress={() => navigation.navigate('SignUp', { email: email.trim() || undefined })}
                    accessibilityRole="link"
                    hitSlop={8}
                  >
                    <Text style={styles.link}>{t('login.signUpAgain')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
          <BigButton onPress={() => void onSubmit()} busy={busy}>
            {t('login.submit')}
          </BigButton>
          <Pressable onPress={() => navigation.navigate('ForgotPassword')} accessibilityRole="link" style={{ alignSelf: 'center' }} hitSlop={8}>
            <Text style={styles.link}>{t('login.forgot')}</Text>
          </Pressable>
        </Panel>

        <View style={styles.signUp}>
          <Text style={styles.signUpPrompt}>{t('login.noAccount')}</Text>
          <BigButton variant="outline" onPress={() => navigation.navigate('SignUp')}>
            {t('login.signUp')}
          </BigButton>
        </View>

        <Text style={styles.footer}>{t('login.footer')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14 },
  logo: { alignSelf: 'center', width: 96, height: 96, borderRadius: 26, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { textAlign: 'center', fontSize: 32, fontWeight: '800', color: palette.text },
  subtitle: { textAlign: 'center', fontSize: 17, color: palette.textSoft, marginBottom: 12 },
  form: { gap: 18, padding: 24, borderRadius: 28 },
  label: { fontSize: 15, fontWeight: '700', color: palette.textSoft },
  inputOutline: { borderRadius: 14 },
  input: { backgroundColor: palette.surface },
  error: { flexDirection: 'row', gap: 10, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 14, padding: 14 },
  errorText: { color: '#991B1B', fontSize: 15, lineHeight: 21 },
  info: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
  infoText: { color: '#9A3412' },
  signUp: { gap: 10, marginTop: 4 },
  signUpPrompt: { textAlign: 'center', color: palette.textSoft, fontSize: 16 },
  link: { color: palette.blue, fontSize: 16, fontWeight: '600', textDecorationLine: 'underline' },
  footer: { textAlign: 'center', color: palette.textMuted, fontSize: 14, lineHeight: 20, marginTop: 24 },
});
