import { useCallback, useState } from 'react';
import { getDeps } from '../../app/container';
import { refreshDashboard } from '../../app/controller';
import { type ConfirmOutcome, confirmAttendance } from '../../domain/useCases/confirmAttendance';

export interface ConfirmFlowState {
  busy: boolean;
  requestId: string | null;
  outcome: ConfirmOutcome | null;
}

/** Manual Check In / Check Out from the dashboard or a notification button (fresh foreground fix). */
export function useConfirmFlow() {
  const [state, setState] = useState<ConfirmFlowState>({ busy: false, requestId: null, outcome: null });

  const run = useCallback(async (requestId: string, via: 'NOTIFICATION' | 'DASHBOARD', userConfirmedAt?: string) => {
    setState({ busy: true, requestId, outcome: null });
    try {
      const deps = await getDeps();
      const outcome = await confirmAttendance(deps, {
        requestId,
        userConfirmedAt: userConfirmedAt ?? new Date().toISOString(),
        via,
      });
      setState({ busy: false, requestId, outcome });
    } catch (e) {
      setState({
        busy: false,
        requestId,
        outcome: { kind: 'ERROR', code: 'UNEXPECTED', message: e instanceof Error ? e.message : String(e) },
      });
    } finally {
      void refreshDashboard();
    }
  }, []);

  const close = useCallback(() => setState({ busy: false, requestId: null, outcome: null }), []);
  return { state, run, close };
}
