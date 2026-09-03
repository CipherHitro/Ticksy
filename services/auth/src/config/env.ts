import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config();

const envSchema = z.object({ 
    NODE_ENV : z.enum(['development', 'test', 'production']).default('development'),
    PORT : z.coerce.number().default(4001),
    DATABASE_URL : z.string().min(1, "DATABASE_URL is required"),
});

const parsed = envSchema.safeParse(process.env);

if(!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const env = parsed.data;
