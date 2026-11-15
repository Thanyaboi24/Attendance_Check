import { LoginRequestSchema } from '@attendance/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { getDeps } from '../../app/container';
import { refreshDashboard } from '../../app/controller';
import { palette } from '../../app/theme';
import { BigButton, Notice, Panel } from '../../ui/kit';
import { validationMessage } from '../../domain/errors';
import { adminWebMessage, login } from '../../domain/useCases/auth';
import { META_ONBOARDED } from '../../domain/useCases/common';
import { useAppStore } from '../../store/appStore';

/** Mockup page 1: institutional email, password, error area, Log in, Forgot password, no public sign-up. */
export function LoginScreen() {
  const { t } = useTranslation(['auth', 'errors', 'common']);
  const navigation = useNavigation();
  const notStaffMessage = useAppStore((s) => s.notStaffMessage);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
              mode="outlined"
              outlineStyle={styles.inputOutline}
              style={styles.input}
            />
          </View>
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>{t('login.password')}</Text>
            <TextInput
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
              onSubmitEditing={onSubmit}
            />
          </View>
          {error ? (
            <View style={styles.error} accessibilityLiveRegion="polite">
              <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#B91C1C" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <BigButton onPress={() => void onSubmit()} busy={busy}>
            {t('login.submit')}
          </BigButton>
          <Pressable onPress={() => navigation.navigate('ForgotPassword')} accessibilityRole="link" style={{ alignSelf: 'center' }} hitSlop={8}>
            <Text style={styles.link}>{t('login.forgot')}</Text>
          </Pressable>
        </Panel>

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
  errorText: { flex: 1, color: '#991B1B', fontSize: 15, lineHeight: 21 },
  link: { color: palette.blue, fontSize: 16, fontWeight: '600', textDecorationLine: 'underline' },
  footer: { textAlign: 'center', color: palette.textMuted, fontSize: 14, lineHeight: 20, marginTop: 24 },
});
