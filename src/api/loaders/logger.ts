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
    level: 'silly',
    levels: winston.config.npm.levels,
    transports,
    exitOnError: true,
    silent: false
});

export default AppLogger;
