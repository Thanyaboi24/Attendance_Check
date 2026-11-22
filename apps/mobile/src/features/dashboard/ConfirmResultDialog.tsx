import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { reasonText, uncertainReasonText } from '../../domain/displayStatus';
import { holidayName } from '../../domain/holidays';
import type { ConfirmOutcome } from '../../domain/useCases/confirmAttendance';
import { openAppSettings } from '../../services/location/permissions';
import { fmtTime, StatusChip } from '../../ui/components';

interface Props {
  outcome: ConfirmOutcome | null;
  onClose: () => void;
  onRetry: () => void;
  onCorrection: () => void;
}

/** Shows the backend's answer. Only an approved result is "Recorded"; queued work is "Pending synchronization". */
export function ConfirmResultDialog({ outcome, onClose, onRetry, onCorrection }: Props) {
  const { t, i18n } = useTranslation('dashboard');
  if (!outcome) return null;
  let title = '';
  let body: React.ReactNode = null;
  let actions: React.ReactNode = <Button onPress={onClose}>{t('result.ok')}</Button>;

  switch (outcome.kind) {
    case 'RECORDED':
      title = t('result.recorded');
      body = (
        <>
          <StatusChip status="RECORDED" />
          <Text variant="bodyMedium">
            {t(outcome.result.method === 'AUTOMATIC' ? 'result.recordedAuto' : 'result.recordedManual', { time: fmtTime(outcome.result.officialTime) })}
          </Text>
        </>
      );
      break;
    case 'PENDING_SYNC':
      title = t('result.pendingSync');
      body = (
        <>
          <StatusChip status="UNSYNCHRONIZED" />
          <Text variant="bodyMedium">{t('result.pendingSyncBody')}</Text>
        </>
      );
      break;
    case 'LOCATION_NOT_CONFIRMED':
      title = t('result.notConfirmed');
      body = (
        <>
          <StatusChip status="UNCERTAIN_LOCATION" />
          <Text variant="bodyMedium">
            {outcome.classification === 'CONFIRMED_INSIDE' || outcome.classification === 'CONFIRMED_OUTSIDE'
              ? t(outcome.classification === 'CONFIRMED_INSIDE' ? 'result.mismatchInside' : 'result.mismatchOutside')
              : uncertainReasonText(outcome.uncertainReason)}
            {outcome.distanceM != null ? t('result.distance', { distance: String(Math.round(outcome.distanceM)) }) : ''}
          </Text>
          <Text variant="bodySmall">{t(outcome.source === 'SERVER' ? 'result.hintServer' : 'result.hint')}</Text>
        </>
      );
      actions = (
        <>
          <Button onPress={onCorrection}>{t('result.submitCorrection')}</Button>
          <Button onPress={onRetry}>{t('result.retry')}</Button>
        </>
      );
      break;
    case 'LOCATION_UNAVAILABLE':
      title = t('result.unavailable');
      body = <Text variant="bodyMedium">{outcome.message}</Text>;
      actions = (
        <>
          {outcome.reason === 'PERMISSION_DENIED' || outcome.reason === 'SERVICES_DISABLED' ? (
            <Button onPress={() => void openAppSettings()}>{t('result.settings')}</Button>
          ) : null}
          <Button onPress={onRetry}>{t('result.retry')}</Button>
        </>
      );
      break;
    case 'ALREADY_RESOLVED':
      title = t('result.alreadyHandled');
      body = (
        <Text variant="bodyMedium">
          {outcome.result?.reason
            ? t('result.alreadyBodyReason', { status: t(`result.requestStatus.${outcome.status}`), reason: reasonText(outcome.result.reason) ?? '' })
            : t('result.alreadyBody', { status: t(`result.requestStatus.${outcome.status}`) })}
        </Text>
      );
      break;
    case 'INVALID_STATE':
      title = t('result.notPossible');
      body = <Text variant="bodyMedium">{t('result.stateChanged')}</Text>;
      break;
    case 'REJECTED':
      title = t('result.notRecorded');
      body = (
        <>
          <StatusChip status="FAILED" />
          <Text variant="bodyMedium">{reasonText(outcome.reason) ?? t('result.serverRejected')}</Text>
        </>
      );
      actions = (
        <>
          <Button onPress={onCorrection}>{t('result.submitCorrection')}</Button>
          <Button onPress={onClose}>{t('result.ok')}</Button>
        </>
      );
      break;
    case 'HOLIDAY_CLOSED':
      title = t('result.holidayTitle');
      body = (
        <Text variant="bodyMedium">
          {outcome.holiday
            ? t('result.holidayBody', { name: holidayName(outcome.holiday, i18n.language === 'th' ? 'th' : 'en') })
            : t('result.holidayBodyNoName')}
        </Text>
      );
      break;
    case 'ERROR':
      title = t('result.error');
      body = <Text variant="bodyMedium">{reasonText(outcome.code) ?? outcome.message}</Text>;
      break;
  }

  return (
    <Portal>
      <Dialog visible onDismiss={onClose}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content style={{ gap: 8 }}>{body}</Dialog.Content>
        <Dialog.Actions>{actionButtons(actions)}</Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

/**
 * Dialog.Actions adds `compact` to each direct child. A fragment as the child makes React warn ("Invalid prop
 * `compact` supplied to React.Fragment"), so a fragment of buttons is turned into a plain list of buttons first.
 */
function actionButtons(node: React.ReactNode): React.ReactNode {
  if (React.isValidElement<{ children?: React.ReactNode }>(node) && node.type === React.Fragment) {
    return React.Children.toArray(node.props.children);
  }
  return node;
}
