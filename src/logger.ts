import fs from 'fs';
import pino from 'pino';

export function createLogger(level: string, logFile = 'logs/app.log') {
  // Clear previous run log to avoid endless growth
  try {
    fs.rmSync(logFile, { force: true });
  } catch {
    // ignore if cannot remove
  }

  const fileStream = pino.destination({ dest: logFile, mkdir: true, sync: false });
  const stdoutStream = pino.destination({ fd: 1, sync: false });

  return pino(
    {
      level,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream([
      { stream: stdoutStream },
      { stream: fileStream },
    ]),
  );
}
