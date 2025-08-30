import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppLogger extends Logger {
  /**
   * Log function start
   */
  logStart(moduleName: string, functionName: string, context?: any): void {
    const timestamp = new Date().toISOString();
    const message = `${timestamp} ${moduleName} ${functionName} Start`;
    this.log(message, context ? JSON.stringify(context) : undefined);
  }

  /**
   * Log function end
   */
  logEnd(moduleName: string, functionName: string, result?: any): void {
    const timestamp = new Date().toISOString();
    const message = `${timestamp} ${moduleName} ${functionName} End`;
    this.log(message, result ? JSON.stringify(result) : undefined);
  }

  /**
   * Log function failure
   */
  logFailed(moduleName: string, functionName: string, error: any): void {
    const timestamp = new Date().toISOString();
    const message = `${timestamp} ${moduleName} ${functionName} Failed`;
    this.error(
      message,
      error?.stack || error?.message || JSON.stringify(error),
    );
  }

  /**
   * Enhanced log with automatic start/end/error handling
   */
  async logFunction<T>(
    moduleName: string,
    functionName: string,
    fn: () => Promise<T> | T,
    context?: any,
  ): Promise<T> {
    this.logStart(moduleName, functionName, context);
    try {
      const result = await Promise.resolve(fn());
      this.logEnd(moduleName, functionName, result);
      return result;
    } catch (error) {
      this.logFailed(moduleName, functionName, error);
      throw error;
    }
  }
}

/**
 * Decorator for automatic function logging
 */
export function LogFunction(moduleName: string) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) {
    const method = descriptor.value;
    const logger = new AppLogger();

    descriptor.value = async function (...args: any[]) {
      logger.logStart(moduleName, propertyName, { args });
      try {
        const result = await method.apply(this, args);
        logger.logEnd(moduleName, propertyName, result);
        return result;
      } catch (error) {
        logger.logFailed(moduleName, propertyName, error);
        throw error;
      }
    };

    return descriptor;
  };
}
