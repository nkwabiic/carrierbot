import winston from 'winston';
import { config } from '../app/config/env.js';

const formats = [
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
];

if (config.NODE_ENV !== 'production') {
  formats.push(winston.format.prettyPrint());
}

export const logger = winston.createLogger({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(...formats),
  transports: [
    new winston.transports.Console(),
  ],
});
