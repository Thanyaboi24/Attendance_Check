import { SetPasswordWithTokenSchema } from '@attendance/shared';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { getDeps } from '../../app/container';
import type { RootStackParamList } from '../../app/navigation/types';
import { isApiError } from '../../domain/errors';

/** Activation (`facultyattendance://activate?token=…`) and reset (`…/reset-password?token=…`) deep links. */
export function SetPasswordScreen() {
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
      setError('The passwords do not match.');
      return;
    }
    const parsed = SetPasswordWithTokenSchema.safeParse({ token, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
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
        isApiError(e) && e.code === 'TOKEN_INVALID'
          ? 'This link is invalid or has expired. Please request a new one.'
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <View style={styles.container}>
        <Text>This link is incomplete. Open the link from your email again.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {done ? (
        <>
          <Text variant="bodyLarge">{mode === 'activate' ? 'Your account is active.' : 'Your password was changed.'} You can now sign in.</Text>
          <Button mode="contained" onPress={() => navigation.navigate('Login')}>
            Go to sign in
          </Button>
        </>
      ) : (
        <>
          <Text variant="bodyMedium">Choose a password with at least 8 characters, including a letter and a digit.</Text>
          <TextInput label="New password" value={password} onChangeText={setPassword} secureTextEntry mode="outlined" />
          <TextInput label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry mode="outlined" />
          <HelperText type="error" visible={error != null}>
            {error}
          </HelperText>
          <Button mode="contained" onPress={onSubmit} loading={busy} disabled={busy}>
            {mode === 'activate' ? 'Activate account' : 'Reset password'}
          </Button>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ container: { padding: 24, gap: 12 } });
