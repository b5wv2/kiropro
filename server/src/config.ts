import 'dotenv/config';

if (!process.env.JWT_SECRET || !process.env.JWT_SECRET.trim()) {
  throw new Error('FATAL: JWT_SECRET is required. Cannot start application without a configured JWT secret.');
}

export const JWT_SECRET: string = process.env.JWT_SECRET.trim();
