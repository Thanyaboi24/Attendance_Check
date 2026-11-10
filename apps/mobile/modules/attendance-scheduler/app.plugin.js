// Config plugin for the attendance-scheduler module (design §6 `plugins/`, §12.1).
// Adds to the app AndroidManifest during `expo prebuild`:
//   - permissions FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION, RECEIVE_BOOT_COMPLETED, WAKE_LOCK
//   - <service GracePeriodHeadlessService android:foregroundServiceType="location">
//   - <receiver BootReceiver> for BOOT_COMPLETED / MY_PACKAGE_REPLACED
// The module's own AndroidManifest.xml declares the same entries (manifest merge); declaring them here as well
// keeps the generated app manifest self-explanatory and survives library-manifest merge changes.
const { withAndroidManifest } = require('expo/config-plugins');

const PKG = 'th.ac.siit.attendance.scheduler';
const SERVICE = `${PKG}.GracePeriodHeadlessService`;
const RECEIVER = `${PKG}.BootReceiver`;
const PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.WAKE_LOCK',
];

/** Pure manifest mutation (unit-tested in __tests__/configPlugin.test.ts). */
function addSchedulerToManifest(manifest) {
  manifest.manifest['uses-permission'] = manifest.manifest['uses-permission'] || [];
  const perms = manifest.manifest['uses-permission'];
  for (const name of PERMISSIONS) {
    if (!perms.some((p) => p.$ && p.$['android:name'] === name)) perms.push({ $: { 'android:name': name } });
  }

  const app = manifest.manifest.application && manifest.manifest.application[0];
  if (!app) throw new Error('attendance-scheduler: <application> not found in AndroidManifest.xml');

  app.service = (app.service || []).filter((s) => s.$['android:name'] !== SERVICE);
  app.service.push({
    $: {
      'android:name': SERVICE,
      'android:exported': 'false',
      'android:foregroundServiceType': 'location',
    },
  });

  app.receiver = (app.receiver || []).filter((r) => r.$['android:name'] !== RECEIVER);
  app.receiver.push({
    $: { 'android:name': RECEIVER, 'android:exported': 'false' },
    'intent-filter': [
      {
        action: [
          { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
          { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
        ],
      },
    ],
  });
  return manifest;
}

const withAttendanceScheduler = (config) =>
  withAndroidManifest(config, (cfg) => {
    cfg.modResults = addSchedulerToManifest(cfg.modResults);
    return cfg;
  });

module.exports = withAttendanceScheduler;
module.exports.addSchedulerToManifest = addSchedulerToManifest;
