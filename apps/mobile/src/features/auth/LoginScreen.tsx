import { LoginRequestSchema } from '@attendance/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput as NativeTextInputComponent,
  useWindowDimensions,
  View,
  type TextInputInstance as NativeTextInput,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { getDeps } from '../../app/container';
import { refreshDashboard } from '../../app/controller';
import type { RootStackParamList } from '../../app/navigation/types';
import { BrandLogo, HAS_OFFICIAL_LOGO } from '../../ui/BrandLogo';
import { Notice } from '../../ui/kit';
import { validationMessage } from '../../domain/errors';
import { adminWebMessage, login } from '../../domain/useCases/auth';
import { META_ONBOARDED } from '../../domain/useCases/common';
import { useAppStore } from '../../store/appStore';

/** Message under the form: an error (red) or an account-state notice (amber), optionally with a sign-up link. */
type LoginMessage = { text: string; tone: 'error' | 'info'; signUpAgain?: boolean };

/** SIIT-style purple used on the sign-in screen. */
/** Colours taken from the SIIT logo: purple #702C8B and crimson #B81F3B. */
const BRAND = { deep: '#2E0F40', mid: '#4E1C69', bright: '#702C8B', accent: '#702C8B', red: '#B81F3B', field: '#F4EFF7', muted: '#7C7389' } as const;

/**
 * Sign-in (mockup page 1), styled like the university's own student app: a purple branded header, a white card
 * with the logo, rounded "pill" fields, a bold sign-in button, then forgot password and self sign-up.
 */
export function LoginScreen() {
  const { t } = useTranslation(['auth', 'errors', 'common']);
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Login'>>();
  const insets = useSafeAreaInsets();
  const notStaffMessage = useAppStore((s) => s.notStaffMessage);
  const prefillEmail = route.params?.email;
  const [email, setEmail] = useState(prefillEmail ?? '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<LoginMessage | null>(null);
  const setError = (text: string | null) => setMessage(text == null ? null : { text, tone: 'error' });
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = React.useRef<NativeTextInput>(null);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const { width } = useWindowDimensions();

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
    <View style={styles.root}>
      <Backdrop />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 36 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>{t('login.brandName')}</Text>
            <Text style={styles.heroOrg}>{t('login.brandOrg')}</Text>
          </View>

          <View style={[styles.card, HAS_OFFICIAL_LOGO && styles.cardWithLogo]}>
            {HAS_OFFICIAL_LOGO ? (
              <View style={styles.officialLogo}>
                <BrandLogo width={Math.min(300, width - 100)} label="SIIT, Thammasat University" />
              </View>
            ) : (
              <View style={styles.logoWrap}>
                <BrandLogo size={92} />
              </View>
            )}
            <Text style={styles.title}>{t('login.title')}</Text>
            <Text style={styles.welcome}>{t('login.welcome')}</Text>

            {notStaffMessage ? <Notice tone="amber">{notStaffMessage}</Notice> : null}

            <PillInput
              icon="email-outline"
              accessibilityLabel={t('login.email')}
              placeholder={t('login.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <PillInput
              ref={passwordRef}
              icon="lock-outline"
              accessibilityLabel={t('login.password')}
              placeholder={t('login.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="password"
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
              right={
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  hitSlop={10}
                  style={styles.eye}
                >
                  <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={BRAND.muted} />
                </Pressable>
              }
            />

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

            <Pressable
              onPress={() => void onSubmit()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('login.submit')}
              accessibilityState={{ busy, disabled: busy }}
              style={({ pressed }) => [styles.submit, pressed && styles.submitPressed, busy && { opacity: 0.8 }]}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{t('login.submit')}</Text>}
              {!busy ? <MaterialCommunityIcons name="arrow-right-circle" size={24} color="#F9C74F" /> : null}
            </Pressable>

            <Pressable onPress={() => navigation.navigate('ForgotPassword')} accessibilityRole="link" style={{ alignSelf: 'center' }} hitSlop={8}>
              <Text style={styles.forgot}>{t('login.forgot')}</Text>
            </Pressable>
          </View>

          <View style={styles.signUpRow}>
            <Text style={styles.signUpPrompt}>{t('login.noAccount')}</Text>
            <Pressable onPress={() => navigation.navigate('SignUp')} accessibilityRole="link" hitSlop={10}>
              <Text style={styles.signUpLink}>{t('login.signUp')}</Text>
            </Pressable>
          </View>
          <Text style={styles.footerNote}>{t('login.footer')}</Text>

          <View style={styles.footer}>
            <View style={styles.footerRule} />
            <Text style={styles.footerInstitute}>{t('login.institute')}</Text>
            <Text style={styles.footerVersion}>{t('login.version', { version })}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Purple gradient header with soft rings (react-native-svg, already in the app: no native rebuild needed). */
function Backdrop() {
  const { width, height } = useWindowDimensions();
  const h = Math.round(height * 0.46);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#F6F4FB' }]} pointerEvents="none">
      <Svg width={width} height={h}>
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BRAND.deep} />
            <Stop offset="0.55" stopColor={BRAND.mid} />
            <Stop offset="1" stopColor={BRAND.bright} />
          </LinearGradient>
        </Defs>
        <Path d={`M0 0 H${width} V${h - 60} Q${width / 2} ${h + 30} 0 ${h - 60} Z`} fill="url(#bg)" />
        <Circle cx={width * 0.92} cy={h * 0.18} r={width * 0.32} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1.5} />
        <Circle cx={width * 0.92} cy={h * 0.18} r={width * 0.2} fill="rgba(255,255,255,0.06)" />
        <Circle cx={width * 0.05} cy={h * 0.72} r={width * 0.22} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1.5} />
      </Svg>
    </View>
  );
}

type PillInputProps = React.ComponentProps<typeof NativeTextInputComponent> & {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  right?: React.ReactNode;
  ref?: React.Ref<NativeTextInput>;
};

/** Rounded "pill" text field with a leading icon. */
function PillInput({ icon, right, style, onFocus, onBlur, ...rest }: PillInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.pill, focused && styles.pillFocused]}>
      <MaterialCommunityIcons name={icon} size={22} color={focused ? BRAND.accent : BRAND.muted} />
      <NativeTextInputComponent
        placeholderTextColor="#A39FB5"
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.pillInput, style]}
      />
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F4FB' },
  container: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 28, gap: 18 },
  hero: { alignItems: 'center', gap: 4, marginBottom: 26 },
  heroTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', letterSpacing: 0.2, textAlign: 'center' },
  heroOrg: { color: '#DDD6FE', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 64,
    paddingBottom: 24,
    gap: 16,
    elevation: 10,
    shadowColor: '#3B0764',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  cardWithLogo: { paddingTop: 26 },
  officialLogo: { alignItems: 'center', paddingBottom: 18, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: '#EFE9F3' },
  logoWrap: { position: 'absolute', top: -50, left: 0, right: 0, alignItems: 'center' },
  title: { textAlign: 'center', fontSize: 26, fontWeight: '800', color: '#1E1B2E' },
  welcome: { textAlign: 'center', fontSize: 15, color: BRAND.muted, marginTop: -8, marginBottom: 4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 56,
    paddingHorizontal: 18,
    borderRadius: 28,
    backgroundColor: BRAND.field,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  pillFocused: { backgroundColor: '#FFFFFF', borderColor: BRAND.accent },
  pillInput: { flex: 1, fontSize: 17, color: '#1E1B2E', paddingVertical: 0 },
  eye: { padding: 4 },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 58,
    borderRadius: 29,
    backgroundColor: BRAND.accent,
    marginTop: 4,
    elevation: 6,
    shadowColor: BRAND.accent,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  submitPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  submitText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },
  forgot: { color: BRAND.accent, fontSize: 15, fontWeight: '600' },
  error: { flexDirection: 'row', gap: 10, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 16, padding: 14 },
  errorText: { color: '#991B1B', fontSize: 15, lineHeight: 21 },
  info: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
  infoText: { color: '#9A3412' },
  link: { color: BRAND.accent, fontSize: 16, fontWeight: '700', textDecorationLine: 'underline' },
  signUpRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 4 },
  signUpPrompt: { color: '#4B4760', fontSize: 16 },
  signUpLink: { color: BRAND.red, fontSize: 16, fontWeight: '800' },
  footerNote: { textAlign: 'center', color: BRAND.muted, fontSize: 13, lineHeight: 19, marginTop: -8 },
  footer: { alignItems: 'center', gap: 4, marginTop: 'auto', paddingTop: 20 },
  footerRule: { width: 48, height: 3, borderRadius: 2, backgroundColor: BRAND.red, marginBottom: 6 },
  footerInstitute: { color: '#4B4760', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  footerVersion: { color: '#A39FB5', fontSize: 12 },
});
