/** Console logger that never prints coordinates in production (design §12.3). */
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.log('[attendance]', ...args);
  },
  warn: (...args: unknown[]) => console.warn('[attendance]', ...args),
  error: (...args: unknown[]) => console.error('[attendance]', ...args),
};
