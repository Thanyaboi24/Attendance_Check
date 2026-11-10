import { type TokenPair, TokenPairSchema, type UserProfile, UserProfileSchema } from '@attendance/shared';
import * as SecureStore from 'expo-secure-store';
import type { SessionStore } from '../../domain/ports';

const TOKENS_KEY = 'auth.tokens';
const USER_KEY = 'auth.user';

/**
 * Tokens in expo-secure-store (Android Keystore-backed). Never AsyncStorage, never the password (design §12.3).
 * Accessible from headless tasks (no UI needed). Values are cached in memory for the life of the JS runtime.
 */
export function createSecureSessionStore(): SessionStore {
  let tokens: TokenPair | null | undefined;
  let user: UserProfile | null | undefined;

  async function read<T>(key: string, parse: (v: unknown) => T | null): Promise<T | null> {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return null;
    try {
      return parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  return {
    async getTokens() {
      if (tokens === undefined) tokens = await read(TOKENS_KEY, (v) => TokenPairSchema.safeParse(v).data ?? null);
      return tokens;
    },
    async setTokens(t) {
      tokens = t;
      await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(t));
    },
    async getUser() {
      if (user === undefined) user = await read(USER_KEY, (v) => UserProfileSchema.safeParse(v).data ?? null);
      return user;
    },
    async setUser(u) {
      user = u;
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(u));
    },
    async clear() {
      tokens = null;
      user = null;
      await SecureStore.deleteItemAsync(TOKENS_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
    },
  };
}
