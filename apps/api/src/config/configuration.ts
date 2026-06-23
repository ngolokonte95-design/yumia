/**
 * Configuration typée chargée depuis l'environnement.
 */
export interface AppConfig {
  env: string;
  port: number;
  globalPrefix: string;
  databaseUrl: string;
  redisUrl: string;
  elasticsearchNode: string;
  storage: {
    provider: 'disk' | 's3';
    s3Bucket: string;
    s3Region: string;
    s3AccessKeyId: string;
    s3SecretAccessKey: string;
    s3Endpoint?: string;
    publicBaseUrl: string;
  };
  google: { clientId: string };
  ai: {
    provider: 'anthropic' | 'mock';
    anthropicApiKey: string;
    modelSmart: string;
    modelFast: string;
    maxTokens: number;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: number;
    refreshTtl: number;
  };
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.API_PORT ?? '4000', 10),
  globalPrefix: process.env.API_GLOBAL_PREFIX ?? 'api',
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  elasticsearchNode: process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200',
  storage: {
    provider: (process.env.STORAGE_PROVIDER as 'disk' | 's3') ?? 'disk',
    s3Bucket: process.env.AWS_S3_BUCKET ?? 'yumia-assets',
    s3Region: process.env.AWS_REGION ?? 'eu-west-3',
    s3AccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    s3SecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    ...(process.env.AWS_S3_ENDPOINT ? { s3Endpoint: process.env.AWS_S3_ENDPOINT } : {}),
    publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL ?? 'http://localhost:4000',
  },
  ai: {
    provider: (process.env.AI_PROVIDER as 'anthropic' | 'mock') ?? 'mock',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    modelSmart: process.env.AI_MODEL_SMART ?? 'claude-sonnet-4-6',
    modelFast: process.env.AI_MODEL_FAST ?? 'claude-haiku-4-5-20251001',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS ?? '1024', 10),
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh',
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '2592000', 10),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  },
});
