import { ForgotPasswordRequestSchema } from '@attendance/shared';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { getDeps } from '../../app/container';
import { isNetworkError, validationMessage } from '../../domain/errors';

export function ForgotPasswordScreen() {
  const { t } = useTranslation(['auth', 'errors', 'common']);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    const parsed = ForgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(validationMessage(parsed.error.issues[0]?.message, t('errors:validation.email')));
      return;
    }
    setBusy(true);
    try {
      const deps = await getDeps();
      await deps.authApi.forgotPassword(parsed.data.email);
      setSent(true);
    } catch (e) {
      setError(isNetworkError(e) ? t('errors:network') : t('errors:generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      {sent ? (
        <Text variant="bodyLarge">{t('forgot.sent')}</Text>
      ) : (
        <>
          <Text variant="bodyMedium">{t('forgot.intro')}</Text>
          <TextInput label={t('forgot.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" mode="outlined" />
          <HelperText type="error" visible={error != null}>
            {error}
          </HelperText>
          <Button mode="contained" onPress={onSubmit} loading={busy} disabled={busy}>
            {t('forgot.submit')}
          </Button>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ container: { padding: 24, gap: 12 } });
