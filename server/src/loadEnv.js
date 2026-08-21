import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve .env relative to this file (project root), not process.cwd() —
// `npm run dev --prefix server` runs Node with cwd=server/, which makes the
// plain `dotenv/config` side-effect import miss the root .env entirely.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
