import { ForgotPasswordRequestSchema } from '@attendance/shared';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { getDeps } from '../../app/container';
import { isNetworkError } from '../../domain/errors';

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    const parsed = ForgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address');
      return;
    }
    setBusy(true);
    try {
      const deps = await getDeps();
      await deps.authApi.forgotPassword(parsed.data.email);
      setSent(true);
    } catch (e) {
      setError(isNetworkError(e) ? 'Cannot reach the server.' : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      {sent ? (
        <Text variant="bodyLarge">
          If an account exists for this email, a single-use reset link has been sent. The link expires in 30 minutes.
        </Text>
      ) : (
        <>
          <Text variant="bodyMedium">Enter your institutional email to receive a password reset link.</Text>
          <TextInput label="Institutional email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" mode="outlined" />
          <HelperText type="error" visible={error != null}>
            {error}
          </HelperText>
          <Button mode="contained" onPress={onSubmit} loading={busy} disabled={busy}>
            Send reset link
          </Button>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ container: { padding: 24, gap: 12 } });
