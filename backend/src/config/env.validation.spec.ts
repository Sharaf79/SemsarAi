/**
 * NJ-029: Config validation spec - tests EnvironmentVariables using class-validator.
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EnvironmentVariables } from './env.validation';

function makeValidEnv(): Record<string, unknown> {
  return {
    DATABASE_URL: 'mysql://semsar:semsar_pass@localhost:3306/semsar_ai',
    GEMINI_API_KEY: 'test-gemini-key',
    JWT_SECRET: 'test-jwt-secret-32-chars-minimum!!',
    WHATSAPP_TOKEN: 'test-wa-token',
    WHATSAPP_PHONE_NUMBER_ID: '123456789',
    WHATSAPP_APP_SECRET: 'test-app-secret',
    WHATSAPP_VERIFY_TOKEN: 'test-verify-token',
  };
}

describe('EnvironmentVariables validation', () => {
  it('passes with all required fields', async () => {
    const env = plainToInstance(EnvironmentVariables, makeValidEnv());
    const errors = await validate(env);
    expect(errors).toHaveLength(0);
  });

  it('passes with optional fields included', async () => {
    const env = plainToInstance(EnvironmentVariables, {
      ...makeValidEnv(),
      JWT_SECRET: 'my-secret',
      JWT_EXPIRES_IN: '7d',
      PORT: '3000',
      NODE_ENV: 'development',
    });
    const errors = await validate(env);
    expect(errors).toHaveLength(0);
  });

  it('fails when DATABASE_URL is missing', async () => {
    const input = makeValidEnv();
    delete input.DATABASE_URL;
    const env = plainToInstance(EnvironmentVariables, input);
    const errors = await validate(env);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('DATABASE_URL');
  });

  it('fails when GEMINI_API_KEY is missing', async () => {
    const input = makeValidEnv();
    delete input.GEMINI_API_KEY;
    const env = plainToInstance(EnvironmentVariables, input);
    const errors = await validate(env);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('GEMINI_API_KEY');
  });

  it('passes without WHATSAPP_TOKEN (optional)', async () => {
    const input = makeValidEnv();
    delete input.WHATSAPP_TOKEN;
    const env = plainToInstance(EnvironmentVariables, input);
    const errors = await validate(env);
    expect(errors).toHaveLength(0);
  });

  it('passes without WHATSAPP_PHONE_NUMBER_ID (optional)', async () => {
    const input = makeValidEnv();
    delete input.WHATSAPP_PHONE_NUMBER_ID;
    const env = plainToInstance(EnvironmentVariables, input);
    const errors = await validate(env);
    expect(errors).toHaveLength(0);
  });

  it('passes without WHATSAPP_APP_SECRET (optional)', async () => {
    const input = makeValidEnv();
    delete input.WHATSAPP_APP_SECRET;
    const env = plainToInstance(EnvironmentVariables, input);
    const errors = await validate(env);
    expect(errors).toHaveLength(0);
  });

  it('passes without WHATSAPP_VERIFY_TOKEN (optional)', async () => {
    const input = makeValidEnv();
    delete input.WHATSAPP_VERIFY_TOKEN;
    const env = plainToInstance(EnvironmentVariables, input);
    const errors = await validate(env);
    expect(errors).toHaveLength(0);
  });

  it('fails when required field is empty string', async () => {
    const env = plainToInstance(EnvironmentVariables, {
      ...makeValidEnv(),
      GEMINI_API_KEY: '',
    });
    const errors = await validate(env);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('GEMINI_API_KEY');
  });

  it('reports multiple missing fields', async () => {
    const env = plainToInstance(EnvironmentVariables, {});
    const errors = await validate(env);
    expect(errors.length).toBeGreaterThanOrEqual(2); // DATABASE_URL + GEMINI_API_KEY
  });

  it('optional fields do not cause errors when absent', async () => {
    const input = makeValidEnv();
    delete input.WHATSAPP_TOKEN;
    delete input.WHATSAPP_PHONE_NUMBER_ID;
    delete input.WHATSAPP_APP_SECRET;
    delete input.WHATSAPP_VERIFY_TOKEN;
    const env = plainToInstance(EnvironmentVariables, input);
    expect(env.JWT_EXPIRES_IN).toBeUndefined();
    expect(env.WHATSAPP_TOKEN).toBeUndefined();
    const errors = await validate(env);
    expect(errors).toHaveLength(0);
  });

  it('fails when JWT_SECRET is missing', async () => {
    const input = makeValidEnv();
    delete input.JWT_SECRET;
    const env = plainToInstance(EnvironmentVariables, input);
    const errors = await validate(env);
    expect(errors.length).toBeGreaterThan(0);
    const jwtError = errors.find((e) => e.property === 'JWT_SECRET');
    expect(jwtError).toBeDefined();
  });
});
