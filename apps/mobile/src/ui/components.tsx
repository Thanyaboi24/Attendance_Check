import { type AttendanceState, formatBangkokDateTime, formatBangkokTime } from '@attendance/shared';
import React from 'react';
import { StyleSheet } from 'react-native';
import { Banner, Chip } from 'react-native-paper';
import { DISPLAY_LABEL, type DisplayStatus } from '../domain/displayStatus';
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
  const color = statusColors[status];
  return (
    <Chip
      icon={STATUS_ICON[status]}
      compact={compact}
      style={{ backgroundColor: `${color}22`, alignSelf: 'flex-start' }}
      textStyle={{ color }}
      accessibilityLabel={`Status: ${DISPLAY_LABEL[status]}`}
    >
      {DISPLAY_LABEL[status]}
    </Chip>
  );
}

export const STATE_LABEL: Record<AttendanceState, string> = {
  CHECKED_OUT: 'Checked out',
  PENDING_CHECK_IN: 'Pending check-in',
  CHECKED_IN: 'Checked in',
  PENDING_CHECK_OUT: 'Pending check-out',
};

const MISSING_TEXT: Record<MissingRequirement, string> = {
  NOTIFICATIONS: 'Notifications are off — you will not be asked to confirm and no automatic attendance can happen.',
  FOREGROUND_LOCATION: 'Location permission is missing — attendance cannot be detected.',
  PRECISE_LOCATION: 'Only approximate location is allowed — every reading will be "Uncertain".',
  BACKGROUND_LOCATION: '"Allow all the time" location is missing — entering/leaving is not detected in the background.',
  LOCATION_SERVICES: 'Location services are turned off.',
  GEOFENCE_CONFIG: 'The attendance area could not be loaded yet (no connection).',
  GEOFENCE_REGISTRATION: 'The attendance area could not be registered with Android.',
};

/** Never claims "Monitoring active" when something is missing (design §9.4.6, DS2 #12). */
export function MonitoringBanner({ status, onFix }: { status: MonitoringStatus | null; onFix: () => void }) {
  if (!status) return null;
  if (status.active) {
    return (
      <Chip icon="shield-check" style={[styles.chipStart, { backgroundColor: `${statusColors.RECORDED}22` }]} textStyle={{ color: statusColors.RECORDED }}>
        Monitoring active (area v{status.configVersion})
      </Chip>
    );
  }
  return (
    <Banner visible icon="alert" actions={[{ label: 'Fix', onPress: onFix }]}>
      {`Monitoring is limited:\n${status.missing.map((m) => `• ${MISSING_TEXT[m]}`).join('\n')}`}
    </Banner>
  );
}

export const fmtTime = (iso: string | null | undefined) => (iso ? formatBangkokTime(iso) : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? formatBangkokDateTime(iso) : '—');

const styles = StyleSheet.create({
  chipStart: { alignSelf: 'flex-start' },
});
