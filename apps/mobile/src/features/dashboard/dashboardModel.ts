import { getActiveConfig, getLocalView } from '../../domain/useCases/common';
import type { AppDeps } from '../../domain/ports';
import type { DashboardModel } from '../../store/appStore';

/** Reads everything the dashboard shows from the local cache (works offline and right after a background task). */
export async function loadDashboardModel(deps: Pick<AppDeps, 'store' | 'api' | 'clock'>): Promise<DashboardModel> {
  const view = await getLocalView(deps);
  const open = await deps.store.listOpenRequests();
  const outbox = await deps.store.listOutbox();
  return {
    state: view.state,
    openSession: view.snapshot?.openSession ?? null,
    todaySessions: view.snapshot?.todaySessions ?? [],
    pending: view.activeRequest,
    unsynced: open.filter((r) => r.localAction != null),
    // Enough for today's timeline (a few transitions per day) and the "needs attention" list.
    recent: await deps.store.listRequests(30),
    outboxCount: outbox.filter((e) => e.status === 'PENDING').length,
    failedOutboxCount: outbox.filter((e) => e.status === 'FAILED').length,
    config: await getActiveConfig(deps, { refresh: false }),
    snapshotFetchedAt: view.snapshot?.fetchedAt ?? null,
  };
}
