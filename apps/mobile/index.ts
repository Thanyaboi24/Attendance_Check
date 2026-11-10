import { registerRootComponent } from 'expo';
import * as TaskManager from 'expo-task-manager';
import { AppRegistry } from 'react-native';
import { HEADLESS_TASKS } from './modules/attendance-scheduler';
import App from './src/app/App';
import { geofenceTaskExecutor } from './src/services/background/geofenceTask';
import { gracePeriodTask } from './src/services/background/gracePeriodTask';
import { bootTask, syncTask } from './src/services/background/syncTask';
import { GEOFENCE_TASK } from './src/services/location/geofence';

// Background entry points MUST be registered at the top level (outside the React tree) so they also run
// headless when the app process was started only for them (design §5, §7.2, §7.6).
TaskManager.defineTask(GEOFENCE_TASK, geofenceTaskExecutor);
AppRegistry.registerHeadlessTask(HEADLESS_TASKS.GRACE_PERIOD, () => gracePeriodTask);
AppRegistry.registerHeadlessTask(HEADLESS_TASKS.SYNC, () => syncTask);
AppRegistry.registerHeadlessTask(HEADLESS_TASKS.BOOT, () => bootTask);

registerRootComponent(App);
