import { SetPasswordWithTokenSchema } from '@attendance/shared';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { getDeps } from '../../app/container';
import type { RootStackParamList } from '../../app/navigation/types';
import { isApiError, validationMessage } from '../../domain/errors';

/** Activation (`facultyattendance://activate?token=…`) and reset (`…/reset-password?token=…`) deep links. */
export function SetPasswordScreen() {
  const { t } = useTranslation(['auth', 'errors', 'common']);
  const route = useRoute<RouteProp<RootStackParamList, 'Activate' | 'ResetPassword'>>();
  const navigation = useNavigation();
  const mode = route.name === 'Activate' ? 'activate' : 'reset';
  const token = route.params?.token ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (password !== confirm) {
      setError(t('setPassword.mismatch'));
      return;
    }
    const parsed = SetPasswordWithTokenSchema.safeParse({ token, password });
    if (!parsed.success) {
      setError(validationMessage(parsed.error.issues[0]?.message, t('errors:validation.invalidInput')));
      return;
    }
    setBusy(true);
    try {
      const deps = await getDeps();
      if (mode === 'activate') await deps.authApi.activate(parsed.data);
      else await deps.authApi.resetPassword(parsed.data);
      setDone(true);
    } catch (e) {
      setError(
        isApiError(e) && e.code === 'TOKEN_INVALID' ? t('setPassword.invalidLink') : t('errors:generic'),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <View style={styles.container}>
        <Text>{t('setPassword.incompleteLink')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {done ? (
        <>
          <Text variant="bodyLarge">{mode === 'activate' ? t('setPassword.activated') : t('setPassword.changed')}</Text>
          <Button mode="contained" onPress={() => navigation.navigate('Login')}>
            {t('setPassword.goToSignIn')}
          </Button>
        </>
      ) : (
        <>
          <Text variant="bodyMedium">{t('setPassword.rules')}</Text>
          <TextInput label={t('setPassword.newPassword')} value={password} onChangeText={setPassword} secureTextEntry mode="outlined" />
          <TextInput label={t('setPassword.confirmPassword')} value={confirm} onChangeText={setConfirm} secureTextEntry mode="outlined" />
          <HelperText type="error" visible={error != null}>
            {error}
          </HelperText>
          <Button mode="contained" onPress={onSubmit} loading={busy} disabled={busy}>
            {mode === 'activate' ? t('setPassword.activate') : t('setPassword.reset')}
          </Button>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ container: { padding: 24, gap: 12 } });
