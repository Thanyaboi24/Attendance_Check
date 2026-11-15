import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import type { RootStackParamList } from '../../app/navigation/types';
import { palette } from '../../app/theme';
import { BigButton, Panel } from '../../ui/kit';

/** "Request sent": the account waits for an administrator; an email follows when it has been reviewed. */
export function SignUpSubmittedScreen() {
  const { t } = useTranslation('auth');
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { email } = useRoute<RouteProp<RootStackParamList, 'SignUpSubmitted'>>().params;

  return (
    <ScrollView style={{ backgroundColor: palette.background }} contentContainerStyle={styles.container}>
      <View style={styles.icon}>
        <MaterialCommunityIcons name="email-check-outline" size={44} color="#FFFFFF" />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {t('signUpSubmitted.title')}
      </Text>
      <Panel style={styles.panel}>
        <Text style={styles.body}>{t('signUpSubmitted.body')}</Text>
        <Text style={styles.body}>{t('signUpSubmitted.emailNotice', { email })}</Text>
        <Text style={styles.body}>{t('signUpSubmitted.next')}</Text>
      </Panel>
      <BigButton onPress={() => navigation.popTo('Login', { email })}>{t('signUpSubmitted.backToSignIn')}</BigButton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 18 },
  icon: { alignSelf: 'center', width: 88, height: 88, borderRadius: 24, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  title: { textAlign: 'center', fontSize: 28, fontWeight: '800', color: palette.text },
  panel: { gap: 12 },
  body: { fontSize: 16, lineHeight: 24, color: palette.text },
});
