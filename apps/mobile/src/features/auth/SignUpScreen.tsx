import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View, type TextInputInstance as NativeTextInput } from 'react-native';
import { HelperText, Text, TextInput, type TextInputProps } from 'react-native-paper';
import { getDeps } from '../../app/container';
import type { RootStackParamList } from '../../app/navigation/types';
import { palette } from '../../app/theme';
import { BigButton, Panel } from '../../ui/kit';
import { signUp, SIGN_UP_FIELDS, type SignUpField, type SignUpFieldErrors, type SignUpForm } from '../../domain/useCases/signUp';

/** Form-level message (server answer that is not about a single field). */
type FormMessage = { text: string; hint?: string; links?: boolean };

const EMPTY: SignUpForm = { staffId: '', fullName: '', department: '', email: '', password: '', confirmPassword: '' };

/**
 * Staff self sign-up. The account is created as "pending approval"; an administrator approves or rejects it on the
 * Admin Web and the applicant gets an email. Validation uses the shared SignUpRequestSchema (+ confirmation).
 */
export function SignUpScreen() {
  const { t } = useTranslation(['auth', 'errors', 'common']);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'SignUp'>>();
  const [form, setForm] = useState<SignUpForm>({ ...EMPTY, email: route.params?.email ?? '' });
  const [errors, setErrors] = useState<SignUpFieldErrors>({});
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const refs: Record<SignUpField, RefObject<NativeTextInput | null>> = {
    staffId: useRef<NativeTextInput>(null),
    fullName: useRef<NativeTextInput>(null),
    department: useRef<NativeTextInput>(null),
    email: useRef<NativeTextInput>(null),
    password: useRef<NativeTextInput>(null),
    confirmPassword: useRef<NativeTextInput>(null),
  };

  const set = (field: SignUpField) => (value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(({ [field]: _removed, ...rest }) => rest);
  };
  const focusNext = (field: SignUpField) => () => {
    const next = SIGN_UP_FIELDS[SIGN_UP_FIELDS.indexOf(field) + 1];
    if (next) refs[next].current?.focus();
    else void onSubmit();
  };

  async function onSubmit() {
    if (busy) return;
    setMessage(null);
    setBusy(true);
    try {
      const deps = await getDeps();
      const out = await signUp(deps, form);
      switch (out.kind) {
        case 'SUBMITTED':
          navigation.replace('SignUpSubmitted', { email: out.email });
          return;
        case 'INVALID': {
          setErrors(out.errors);
          setMessage({ text: t('signUp.fixErrors') });
          const first = SIGN_UP_FIELDS.find((f) => out.errors[f] != null);
          if (first) refs[first].current?.focus();
          return;
        }
        case 'DUPLICATE':
          setMessage({ text: t('signUp.duplicate'), hint: t('signUp.duplicateHint'), links: true });
          return;
        case 'DISABLED':
          setMessage({ text: t('signUp.disabled') });
          return;
        case 'RATE_LIMITED':
          setMessage({ text: t('signUp.rateLimited') });
          return;
        case 'NETWORK':
          setMessage({ text: t('signUp.network') });
          return;
        case 'ERROR':
          setMessage({ text: out.message });
          return;
      }
    } finally {
      setBusy(false);
    }
  }

  const passwordToggle = (
    <TextInput.Icon
      icon={showPassword ? 'eye-off' : 'eye'}
      accessibilityLabel={showPassword ? t('login.hidePassword') : t('login.showPassword')}
      onPress={() => setShowPassword((v) => !v)}
    />
  );

  const field = (name: SignUpField, label: string, props: Partial<TextInputProps> & { helper?: string } = {}) => {
    const { right, helper, ...inputProps } = props;
    const error = errors[name];
    const last = name === 'confirmPassword';
    return (
      <View style={{ gap: 6 }}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          ref={refs[name]}
          accessibilityLabel={label}
          value={form[name]}
          onChangeText={set(name)}
          error={error != null}
          editable={!busy}
          mode="outlined"
          outlineStyle={styles.inputOutline}
          style={styles.input}
          returnKeyType={last ? 'send' : 'next'}
          submitBehavior={last ? 'blurAndSubmit' : 'submit'}
          onSubmitEditing={focusNext(name)}
          right={right}
          {...inputProps}
        />
        {error ? (
          <HelperText type="error" visible padding="none" style={styles.helper}>
            {error}
          </HelperText>
        ) : helper ? (
          <HelperText type="info" visible padding="none" style={styles.helper}>
            {helper}
          </HelperText>
        ) : null}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: palette.background }} behavior="height">
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{t('signUp.intro')}</Text>
        <Panel style={styles.form}>
          {field('staffId', t('signUp.staffId'), { autoCapitalize: 'characters', autoCorrect: false })}
          {field('fullName', t('signUp.fullName'), { autoCapitalize: 'words', autoComplete: 'name' })}
          {field('department', t('signUp.department'), { autoCapitalize: 'words' })}
          {field('email', t('signUp.email'), {
            placeholder: t('signUp.emailPlaceholder'),
            autoCapitalize: 'none',
            autoCorrect: false,
            autoComplete: 'email',
            keyboardType: 'email-address',
          })}
          {field('password', t('signUp.password'), {
            secureTextEntry: !showPassword,
            autoCapitalize: 'none',
            autoComplete: 'new-password',
            right: passwordToggle,
            helper: t('signUp.passwordRules'),
          })}
          {field('confirmPassword', t('signUp.confirmPassword'), {
            secureTextEntry: !showPassword,
            autoCapitalize: 'none',
            autoComplete: 'new-password',
          })}

          {message ? (
            <View style={styles.error} accessibilityLiveRegion="polite">
              <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#B91C1C" />
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={styles.errorText}>{message.text}</Text>
                {message.hint ? <Text style={styles.errorText}>{message.hint}</Text> : null}
                {message.links ? (
                  <View style={styles.links}>
                    <Pressable onPress={() => navigation.popTo('Login', { email: form.email.trim() || undefined })} accessibilityRole="link" hitSlop={8}>
                      <Text style={styles.link}>{t('signUp.signIn')}</Text>
                    </Pressable>
                    <Pressable onPress={() => navigation.navigate('ForgotPassword')} accessibilityRole="link" hitSlop={8}>
                      <Text style={styles.link}>{t('signUp.forgotPassword')}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          <BigButton onPress={() => void onSubmit()} busy={busy}>
            {t('signUp.submit')}
          </BigButton>
        </Panel>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('signUp.haveAccount')}</Text>
          <Pressable onPress={() => navigation.popTo('Login')} accessibilityRole="link" hitSlop={8}>
            <Text style={styles.link}>{t('signUp.signIn')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 8, gap: 16 },
  intro: { fontSize: 16, lineHeight: 24, color: palette.textSoft },
  form: { gap: 16, padding: 24, borderRadius: 28 },
  label: { fontSize: 15, fontWeight: '700', color: palette.textSoft },
  inputOutline: { borderRadius: 14 },
  input: { backgroundColor: palette.surface },
  helper: { fontSize: 14 },
  error: { flexDirection: 'row', gap: 10, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 14, padding: 14 },
  errorText: { color: '#991B1B', fontSize: 15, lineHeight: 21 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  link: { color: palette.blue, fontSize: 16, fontWeight: '600', textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 16 },
  footerText: { color: palette.textSoft, fontSize: 16 },
});
