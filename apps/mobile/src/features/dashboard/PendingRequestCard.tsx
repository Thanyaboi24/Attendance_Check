import { formatBangkokTime, RequestType } from '@attendance/shared';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import Svg, { Circle } from 'react-native-svg';
import { palette } from '../../app/theme';
import type { LocalRequest } from '../../domain/models';
import { countdown, shortRequestId } from '../locationMap/locationModel';

const SIZE = 104;
const STROKE = 9;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/** Ring that empties as the grace period runs out (page 4). */
function CountdownRing({ fraction, label }: { fraction: number; label: string }) {
  return (
    <View style={styles.ring} accessibilityLabel={`${label} remaining`}>
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
}

/**
 * Pending check-in / check-out (mockup page 4, design §12.4). The countdown is informative only: the decision at
 * the deadline is taken by the background task after a fresh location check, never by this timer.
 */
export function PendingRequestCard({ request, busy, onConfirm }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isIn = request.type === RequestType.CHECK_IN;
  const cd = countdown(request.notificationPostedAt ?? request.geofenceDetectedAt, request.deadlineAt, now);
  const notifFailed = request.notificationStatus === 'FAILED';
  const side = isIn ? 'inside' : 'outside';

  let headline = 'Waiting for your response';
  let detail = `Auto ${isIn ? 'check-in' : 'check-out'} at about ${formatBangkokTime(request.deadlineAt)} if your location is still ${side}.`;
  if (notifFailed) {
    headline = 'Please confirm manually';
    detail = 'The notification could not be shown, so automatic attendance is not allowed for this request.';
  } else if (cd.expired) {
    headline = 'Verifying your location…';
    detail = `The grace period is over. The app is checking that you are still ${side} before recording.`;
  }

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.kicker}>{isIn ? 'Pending check-in' : 'Pending check-out'}</Text>
        <Text style={styles.muted}>Request #{shortRequestId(request.requestId)}</Text>
      </View>

      <View style={styles.body}>
        {notifFailed ? null : <CountdownRing fraction={cd.fraction} label={cd.label} />}
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.headline}>{headline}</Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
      </View>

      {request.lastError === 'LOCATION_NOT_CONFIRMED' ? (
        <Text style={styles.warn}>Your last confirmation could not be verified by the server. Try again or request a correction.</Text>
      ) : null}

      <Button
        mode="contained"
        onPress={onConfirm}
        loading={busy}
        disabled={busy}
        style={styles.button}
        contentStyle={styles.buttonContent}
        labelStyle={styles.buttonLabel}
      >
        {isIn ? 'Check in now' : 'Check out now'}
      </Button>
      <Text style={styles.muted}>Dismissing the notification does not cancel this request.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1.5, borderColor: palette.amberBorder, padding: 20, gap: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { fontSize: 16, fontWeight: '700', color: palette.amberText },
  muted: { fontSize: 13, color: palette.textMuted },
  body: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ringLabel: { position: 'absolute', fontSize: 24, fontFamily: 'monospace', color: palette.amberText },
  headline: { fontSize: 19, fontWeight: '700', color: palette.text },
  detail: { fontSize: 15, lineHeight: 21, color: palette.textSoft },
  warn: { fontSize: 13, color: '#DC2626' },
  button: { borderRadius: 14 },
  buttonContent: { height: 54 },
  buttonLabel: { fontSize: 18, fontWeight: '700' },
});
