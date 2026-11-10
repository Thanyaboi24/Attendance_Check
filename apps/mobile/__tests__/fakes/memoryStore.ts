import type { GeofenceConfig } from '@attendance/shared';
import type {
  EventLogEntry,
  EventType,
  EvidenceRecord,
  LocalRequest,
  NewOutboxEntry,
  OutboxEntry,
  StateSnapshot,
} from '../../src/domain/models';
import type { LocalStore } from '../../src/domain/ports';

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** In-memory LocalStore with the same semantics as the SQLite implementation. */
export class MemoryStore implements LocalStore {
  configs = new Map<number, GeofenceConfig>();
  requests = new Map<string, LocalRequest>();
  evidence: EvidenceRecord[] = [];
  outbox: OutboxEntry[] = [];
  snapshot: StateSnapshot | null = null;
  meta = new Map<string, string>();
  events: EventLogEntry[] = [];
  private outboxSeq = 0;
  private eventSeq = 0;

  async saveConfig(cfg: GeofenceConfig) {
    this.configs.set(cfg.version, clone(cfg));
  }
  async getConfig(version: number) {
    return clone(this.configs.get(version) ?? null);
  }
  async getLatestConfig() {
    const versions = [...this.configs.keys()].sort((a, b) => b - a);
    return versions.length ? clone(this.configs.get(versions[0] as number) ?? null) : null;
  }

  async insertRequest(req: LocalRequest) {
    if (this.requests.has(req.requestId)) throw new Error('duplicate request');
    this.requests.set(req.requestId, clone(req));
  }
  async getRequest(id: string) {
    return clone(this.requests.get(id) ?? null);
  }
  async updateRequest(id: string, patch: Partial<LocalRequest>) {
    const r = this.requests.get(id);
    if (r) this.requests.set(id, { ...r, ...clone(patch) });
  }
  private sorted() {
    return [...this.requests.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async getActiveRequest() {
    const list = this.sorted().filter((r) => r.status === 'ACTIVE' && r.localAction == null);
    return clone(list[list.length - 1] ?? null);
  }
  async listOpenRequests() {
    return clone(this.sorted().filter((r) => r.status === 'ACTIVE'));
  }
  async listRequests(limit: number) {
    return clone(this.sorted().reverse().slice(0, limit));
  }

  async insertEvidence(e: EvidenceRecord) {
    this.evidence.push(clone(e));
  }
  async listEvidence(requestId: string) {
    return clone(this.evidence.filter((e) => e.requestId === requestId));
  }

  async enqueueOutbox(entry: NewOutboxEntry, now: string) {
    const id = ++this.outboxSeq;
    this.outbox.push({ ...clone(entry), id, attempts: 0, nextAttemptAt: now, status: 'PENDING', lastError: null, createdAt: now });
    return id;
  }
  async listOutbox() {
    return clone([...this.outbox].sort((a, b) => a.id - b.id));
  }
  async updateOutbox(id: number, patch: Partial<OutboxEntry>) {
    this.outbox = this.outbox.map((e) => (e.id === id ? { ...e, ...clone(patch) } : e));
  }
  async deleteOutbox(id: number) {
    this.outbox = this.outbox.filter((e) => e.id !== id);
  }
  async hasPendingOutboxFor(requestId: string) {
    return this.outbox.some((e) => e.requestId === requestId && e.status === 'PENDING');
  }

  async saveSnapshot(s: StateSnapshot) {
    this.snapshot = clone(s);
  }
  async getSnapshot() {
    return clone(this.snapshot);
  }

  async getMeta(key: string) {
    return this.meta.get(key) ?? null;
  }
  async setMeta(key: string, value: string | null) {
    if (value == null) this.meta.delete(key);
    else this.meta.set(key, value);
  }

  async logEvent(type: EventType, requestId: string | null, detail: Record<string, unknown>, at: string) {
    this.events.push({ id: ++this.eventSeq, type, requestId, detail: clone(detail), at });
  }
  async listEvents() {
    return clone(this.events);
  }

  async clearUserData() {
    this.requests.clear();
    this.evidence = [];
    this.outbox = [];
    this.snapshot = null;
  }
}
