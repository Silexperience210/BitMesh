/**
 * Logger simple avec niveaux
 * 
 * Usage: logger.debug('message') | logger.info('message') | logger.error('message')
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL: LogLevel = __DEV__ ? 'debug' : 'error'; // En prod, seulement errors

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[LOG_LEVEL];
}

export const logger = {
  debug: (message: string, ...args: any[]) => {
    if (shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
  
  info: (message: string, ...args: any[]) => {
    if (shouldLog('info')) {
      console.log(`[INFO] ${message}`, ...args);
    }
  },
  
  warn: (message: string, ...args: any[]) => {
    if (shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  },
  
  error: (message: string, ...args: any[]) => {
    if (shouldLog('error')) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  },
};

export default logger;
