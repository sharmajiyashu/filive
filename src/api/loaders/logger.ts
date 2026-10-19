import winston from 'winston';

const transports = [
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.errors({ stack: true }),
            winston.format.metadata(),
            winston.format.json()
        )
    })
];

const AppLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    levels: winston.config.npm.levels,
    transports,
    exitOnError: false,
    silent: false
});

export default AppLogger;
