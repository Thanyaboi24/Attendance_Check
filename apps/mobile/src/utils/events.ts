/** Tiny change bus: use cases signal "local data changed"; the UI store re-reads SQLite (replaces useLiveQuery). */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onLocalDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitLocalDataChanged(): void {
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      /* ignore listener errors */
    }
  }
}
