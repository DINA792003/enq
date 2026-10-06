import dotenv from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';

const envPath = [
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../../../../../.env'),
].find(existsSync);

if (envPath) dotenv.config({ path: envPath });
