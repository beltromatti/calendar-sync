import { loadConfig } from './config';
import { AppleCalDAVClient } from './clients/appleClient';
import { GoogleCalendarClient } from './clients/googleClient';
import { createLogger } from './logger';
import { SyncService } from './sync/syncService';

async function bootstrap() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const appleClient = new AppleCalDAVClient(config.apple, logger);
  const googleClient = new GoogleCalendarClient(config.google, config.timezone, logger);

  await Promise.all([appleClient.init(), googleClient.init()]);
  const service = new SyncService(appleClient, googleClient, config, logger);

  logger.info(
    {
      intervalMinutes: config.syncIntervalMinutes,
      windowDays: config.syncWindowDays,
      mappings: config.mappings.length,
    },
    'Calendar sync service started',
  );

  const runSync = async () => {
    try {
      await service.syncOnce();
    } catch (err) {
      logger.error({ err }, 'Sync cycle failed');
    }
  };

  await runSync();
  setInterval(runSync, config.syncIntervalMinutes * 60 * 1000);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error bootstrapping sync', err);
  process.exit(1);
});
