const REQUIRED_KEYS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'WEB_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'MAIL_FROM',
] as const;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_KEYS.filter(
    (key) => config[key] === undefined || config[key] === '',
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
  return config;
}
