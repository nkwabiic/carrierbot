import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './app/config/env.js';
import { logger } from './utils/logger.js';
import { loggerMiddleware } from './app/middleware/logger.middleware.js';
import { errorHandler } from './app/middleware/error.middleware.js';
import { rateLimiter } from './app/middleware/rate-limiter.middleware.js';
import routes from './app/routes/index.js';

const app = express();

// Security and utility middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Custom middlewares
app.use(loggerMiddleware);
app.use(rateLimiter);

// API Routes
app.use('/api', routes);

// Global Error Handler
app.use(errorHandler);

const PORT = config.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT} in ${config.NODE_ENV} mode.`);
});

export default app;
