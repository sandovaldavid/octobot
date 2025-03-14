import mongoose from 'mongoose';
import { debug, logger } from '@utils/logger';

export const connectDB = async (): Promise<void> => {
    try {
        const dbName = process.env.MONGODB_DB_NAME;
        const uri = process.env.MONGODB_URI;

        if (!uri) {
            throw new Error('MONGODB_URI is not defined in environment variables');
        }

        const conn = await mongoose.connect(uri, {
            dbName: dbName,
        });

        logger.info(`MongoDB Connected: ${conn.connection.host}`);
        logger.info(`Database: ${conn.connection.name}`);

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected, attempting to reconnect...');
        });

        mongoose.connection.on('error', (err) => {
            logger.error(`MongoDB error: ${err}`);
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('MongoDB reconnected');
        });
    } catch (error) {
        if (error instanceof Error) {
            logger.error(`MongoDB connection error: ${error.message}`);
        } else {
            logger.error('MongoDB connection error: Unknown error');
        }
        process.exit(1);
    }
};

export default connectDB;
