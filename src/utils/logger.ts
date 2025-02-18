import winston from 'winston';
import { format } from 'winston';

const { combine, timestamp, printf, colorize } = format;

// Logger format
const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}] : ${message}`;
    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
});

// Logger configuration
export const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), colorize(), logFormat),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880,
            maxFiles: 5,
        }),
        new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880,
            maxFiles: 5,
        }),
        new winston.transports.File({
            filename: 'logs/http.log',
            level: 'http',
            maxsize: 5242880,
            maxFiles: 5,
        }),
    ],
});

// HTTP Logger configuration
export const httpLogger = {
    request: (req: any) => {
        logger.http('Incoming Request', {
            method: req.method,
            path: req.path,
            body: req.body,
            query: req.query,
            ip: req.ip,
        });
    },
    response: (req: any, res: any, responseTime: number) => {
        logger.http('Outgoing Response', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            responseTime: `${responseTime}ms`,
        });
    },
};

// Debug Logger configuration
export const debug = {
    info: (message: string, meta?: any) => logger.info(message, meta),
    error: (message: string, meta?: any) => logger.error(message, meta),
    warn: (message: string, meta?: any) => logger.warn(message, meta),
    debug: (message: string, meta?: any) => logger.debug(message, meta),
    http: (message: string, meta?: any) => logger.http(message, meta),
};
