import { type AttendanceState, formatBangkokDateTime, formatBangkokTime } from '@attendance/shared';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { Banner, Chip } from 'react-native-paper';
import type { DisplayStatus } from '../domain/displayStatus';
import { t as translate } from '../i18n';
import type { MissingRequirement, MonitoringStatus } from '../domain/useCases/monitoring';
import { statusColors } from '../app/theme';

const STATUS_ICON: Record<DisplayStatus, string> = {
  RECORDED: 'check-circle',
  PENDING: 'timer-sand',
  UNCERTAIN_LOCATION: 'map-marker-question',
  FAILED: 'alert-circle',
  UNSYNCHRONIZED: 'cloud-upload-outline',
  CANCELLED: 'cancel',
};

/** One of the five statuses the UI must keep apart (Recorded · Pending · Uncertain · Failed · Unsynchronized). */
export function StatusChip({ status, compact }: { status: DisplayStatus; compact?: boolean }) {
  const { t } = useTranslation();
  const color = statusColors[status];
  const label = t(`displayStatus.${status}`);
  return (
    <Chip
      icon={STATUS_ICON[status]}
      compact={compact}
      style={{ backgroundColor: `${color}22`, alignSelf: 'flex-start', maxWidth: '100%' }}
      textStyle={{ color }}
      accessibilityLabel={t('statusA11y', { label })}
    >
      {label}
    </Chip>
  );
}

const ATTENDANCE_STATES: readonly AttendanceState[] = ['CHECKED_OUT', 'PENDING_CHECK_IN', 'CHECKED_IN', 'PENDING_CHECK_OUT'];

/** Attendance state label in the current language. */
export function stateLabel(state: AttendanceState): string {
  return translate(`common:state.${state}`);
}

/** Same as `stateLabel`, as a lookup table; every read follows the current language. */
export const STATE_LABEL: Readonly<Record<AttendanceState, string>> = Object.defineProperties(
  {} as Record<AttendanceState, string>,
  Object.fromEntries(ATTENDANCE_STATES.map((s) => [s, { get: () => stateLabel(s), enumerable: true }])),
);

/** Never claims "Monitoring active" when something is missing (design §9.4.6, DS2 #12). */
export function MonitoringBanner({ status, onFix }: { status: MonitoringStatus | null; onFix: () => void }) {
  const { t } = useTranslation();
  if (!status) return null;
  if (status.active) {
    return (
      <Chip
        icon="shield-check"
        style={[styles.chipStart, { backgroundColor: `${statusColors.RECORDED}22` }]}
        textStyle={{ color: statusColors.RECORDED }}
      >
        {t('monitoring.activeWithVersion', { version: String(status.configVersion ?? '') })}
      </Chip>
    );
  }
  const missing = status.missing.map((m: MissingRequirement) => `• ${t(`monitoring.missing.${m}`)}`).join('\n');
  return (
    <Banner visible icon="alert" actions={[{ label: t('monitoring.fix'), onPress: onFix }]}>
      {`${t('monitoring.limited')}\n${missing}`}
    </Banner>
  );
}

export const fmtTime = (iso: string | null | undefined) => (iso ? formatBangkokTime(iso) : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? formatBangkokDateTime(iso) : '—');

const styles = StyleSheet.create({
  chipStart: { alignSelf: 'flex-start', maxWidth: '100%' },
});
