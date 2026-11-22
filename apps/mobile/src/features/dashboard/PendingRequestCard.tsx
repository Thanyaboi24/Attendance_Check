import { formatBangkokTime, type HolidayDto, RequestType } from '@attendance/shared';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import Svg, { Circle } from 'react-native-svg';
import { palette } from '../../app/theme';
import { holidayName } from '../../domain/holidays';
import type { LocalRequest } from '../../domain/models';
import { countdown, shortRequestId } from '../locationMap/locationModel';

const SIZE = 104;
const STROKE = 9;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/** Ring that empties as the grace period runs out (page 4). */
function CountdownRing({ fraction, label }: { fraction: number; label: string }) {
  const { t } = useTranslation('dashboard');
  return (
    <View style={styles.ring} accessibilityLabel={t('pending.remaining', { time: label })}>
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={palette.amberTrack} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={palette.amberRing}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${C} ${C}`}
          strokeDashoffset={C * (1 - fraction)}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <Text style={styles.ringLabel}>{label}</Text>
    </View>
  );
}

interface Props {
  request: LocalRequest;
  busy: boolean;
  onConfirm(): void;
  /** Today's holiday: a pending check-in cannot be confirmed (check-in is closed); check-out is unaffected. */
  holiday?: HolidayDto | null;
}

/**
 * Pending check-in / check-out (mockup page 4, design §12.4). The countdown is informative only: the decision at
 * the deadline is taken by the background task after a fresh location check, never by this timer.
 */
export function PendingRequestCard({ request, busy, onConfirm, holiday }: Props) {
  const { t, i18n } = useTranslation('dashboard');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isIn = request.type === RequestType.CHECK_IN;
  const cd = countdown(request.notificationPostedAt ?? request.geofenceDetectedAt, request.deadlineAt, now);
  const notifFailed = request.notificationStatus === 'FAILED';
  const locked = isIn && holiday != null;
  let headline: string = t('pending.waiting');
  let detail: string = t(isIn ? 'pending.autoIn' : 'pending.autoOut', { time: formatBangkokTime(request.deadlineAt) });
  if (notifFailed) {
    headline = t('pending.confirmManually');
    detail = t('pending.notificationFailed');
  } else if (cd.expired) {
    headline = t('pending.verifying');
    detail = t(isIn ? 'pending.graceOverIn' : 'pending.graceOverOut');
  }

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.kicker}>{isIn ? t('pending.kickerIn') : t('pending.kickerOut')}</Text>
        <Text style={styles.muted}>{t('pending.requestRef', { id: shortRequestId(request.requestId) })}</Text>
      </View>

      <View style={styles.body}>
        {notifFailed ? null : <CountdownRing fraction={cd.fraction} label={cd.label} />}
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.headline}>{headline}</Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
      </View>

      {request.lastError === 'LOCATION_NOT_CONFIRMED' ? (
        <Text style={styles.warn}>{t('pending.notVerified')}</Text>
      ) : null}

      {locked ? (
        <>
          <Button
            mode="contained"
            icon="lock"
            disabled
            onPress={() => undefined}
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            accessibilityHint={t('holiday.locked')}
          >
            {t('pending.holidayLocked')}
          </Button>
          <Text style={styles.holidayNote}>{t('pending.holidayNote', { name: holidayName(holiday, i18n.language === 'th' ? 'th' : 'en') })}</Text>
        </>
      ) : (
        <>
          <Button
            mode="contained"
            onPress={onConfirm}
            loading={busy}
            disabled={busy}
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
          >
            {isIn ? t('pending.checkInNow') : t('pending.checkOutNow')}
          </Button>
          <Text style={styles.muted}>{t('pending.dismissNote')}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1.5, borderColor: palette.amberBorder, padding: 20, gap: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  kicker: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: palette.amberText },
  muted: { fontSize: 13, color: palette.textMuted },
  body: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ringLabel: { position: 'absolute', fontSize: 24, fontFamily: 'monospace', color: palette.amberText },
  headline: { fontSize: 19, fontWeight: '700', color: palette.text },
  detail: { fontSize: 15, lineHeight: 21, color: palette.textSoft },
  warn: { fontSize: 13, color: '#DC2626' },
  holidayNote: { fontSize: 13, lineHeight: 19, color: '#9F1239' },
  button: { borderRadius: 14 },
  buttonContent: { height: 54 },
  buttonLabel: { fontSize: 18, fontWeight: '700' },
});
