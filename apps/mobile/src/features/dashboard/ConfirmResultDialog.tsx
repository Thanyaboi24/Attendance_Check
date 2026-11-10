import React from 'react';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { reasonText, uncertainReasonText } from '../../domain/displayStatus';
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
  if (!outcome) return null;
  let title = '';
  let body: React.ReactNode = null;
  let actions: React.ReactNode = <Button onPress={onClose}>OK</Button>;

  switch (outcome.kind) {
    case 'RECORDED':
      title = 'Recorded';
      body = (
        <>
          <StatusChip status="RECORDED" />
          <Text variant="bodyMedium">
            {outcome.result.method === 'AUTOMATIC' ? 'Automatic' : 'Manual'} attendance recorded at {fmtTime(outcome.result.officialTime)} (Bangkok
            time, server approval time).
          </Text>
        </>
      );
      break;
    case 'PENDING_SYNC':
      title = 'Pending synchronization';
      body = (
        <>
          <StatusChip status="UNSYNCHRONIZED" />
          <Text variant="bodyMedium">
            Your confirmation is saved on this phone and will be sent automatically when the connection returns. It is not recorded yet.
          </Text>
        </>
      );
      break;
    case 'LOCATION_NOT_CONFIRMED':
      title = 'Location not confirmed';
      body = (
        <>
          <StatusChip status="UNCERTAIN_LOCATION" />
          <Text variant="bodyMedium">
            {outcome.classification === 'CONFIRMED_INSIDE' || outcome.classification === 'CONFIRMED_OUTSIDE'
              ? `You appear to be ${outcome.classification === 'CONFIRMED_INSIDE' ? 'inside' : 'outside'} the attendance area, which does not match this request.`
              : uncertainReasonText(outcome.uncertainReason)}
            {outcome.distanceM != null ? ` Distance from centre: ${Math.round(outcome.distanceM)} m.` : ''}
          </Text>
          <Text variant="bodySmall">
            Move to an open area and retry, or submit a correction request. The request is still pending
            {outcome.source === 'SERVER' ? ' (checked by the server)' : ''}.
          </Text>
        </>
      );
      actions = (
        <>
          <Button onPress={onCorrection}>Submit correction request</Button>
          <Button onPress={onRetry}>Retry</Button>
        </>
      );
      break;
    case 'LOCATION_UNAVAILABLE':
      title = 'Location unavailable';
      body = <Text variant="bodyMedium">{outcome.message}</Text>;
      actions = (
        <>
          {outcome.reason === 'PERMISSION_DENIED' || outcome.reason === 'SERVICES_DISABLED' ? (
            <Button onPress={() => void openAppSettings()}>Settings</Button>
          ) : null}
          <Button onPress={onRetry}>Retry</Button>
        </>
      );
      break;
    case 'ALREADY_RESOLVED':
      title = 'Already handled';
      body = (
        <Text variant="bodyMedium">
          This request was already finished ({outcome.status.toLowerCase()}
          {outcome.result?.reason ? ` — ${reasonText(outcome.result.reason)}` : ''}).
        </Text>
      );
      break;
    case 'INVALID_STATE':
      title = 'Not possible';
      body = <Text variant="bodyMedium">Your attendance state changed before this request was confirmed.</Text>;
      break;
    case 'REJECTED':
      title = 'Not recorded';
      body = (
        <>
          <StatusChip status="FAILED" />
          <Text variant="bodyMedium">{reasonText(outcome.reason) ?? 'The server rejected the request.'}</Text>
        </>
      );
      actions = (
        <>
          <Button onPress={onCorrection}>Submit correction request</Button>
          <Button onPress={onClose}>OK</Button>
        </>
      );
      break;
    case 'ERROR':
      title = 'Something went wrong';
      body = <Text variant="bodyMedium">{reasonText(outcome.code) ?? outcome.message}</Text>;
      break;
  }

  return (
    <Portal>
      <Dialog visible onDismiss={onClose}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content style={{ gap: 8 }}>{body}</Dialog.Content>
        <Dialog.Actions>{actions}</Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
