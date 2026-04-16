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
    GEMINI_API_KEY: 'AIzaSyDtEPg-URKXWCbSwlwPW3nI4uXujIZ6j20',
    JWT_SECRET: '4Snl9jKO29lAJa1o+2AbDPKcKb6F80ICKb60Mo7ADR0=',
    WHATSAPP_TOKEN: 'EAAb1GDB4KEoBRJJBAntw0CMRniwe4eZA3ZB32re4UZBIQOZBcI3qIIpBn6PhsTAc0f7YW53IQZBlqP8w4iJxvk7KWlRF1bS1ffyUiDG4rd6Sbk8ztIdlYvZCUHZAuxTlrArWmwxlaXUt6Be9AhJuFvKDvSLAkvvSoAfYqybaBoOHpmnJlsboWbHsGzUFZAGUuREngSZCS1J2e1M7ggzwy6H9WsvDgC0FepFBawjbyhwXur5rMQrJN5TivehuXeEawd0zrEvYa5s3r0RymNnyQNQZDZD',
    WHATSAPP_PHONE_NUMBER_ID: '1004555129414691',
    WHATSAPP_APP_SECRET: 'c8dd695933f50fc5bb5595a58fac5e94',
    WHATSAPP_VERIFY_TOKEN: 'I5iCVE3aYEXYsrzlIEC2Qc8tZ6kP1fRQ',
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

  it('fails in production when placeholders are still present', async () => {
    const env = plainToInstance(EnvironmentVariables, {
      ...makeValidEnv(),
      NODE_ENV: 'production',
      GEMINI_API_KEY: 'your_gemini_api_key_here',
      JWT_SECRET: 'your_jwt_secret_here',
      WHATSAPP_TOKEN: 'your_whatsapp_token_here',
      WHATSAPP_PHONE_NUMBER_ID: 'your_phone_number_id_here',
      WHATSAPP_APP_SECRET: 'your_app_secret_here',
      WHATSAPP_VERIFY_TOKEN: 'your_verify_token_here',
    });

    const errors = await validate(env);
    const props = errors.map((error) => error.property);

    expect(props).toEqual(expect.arrayContaining([
      'GEMINI_API_KEY',
      'JWT_SECRET',
      'WHATSAPP_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_APP_SECRET',
      'WHATSAPP_VERIFY_TOKEN',
    ]));
  });

  it('allows placeholders outside production mode', async () => {
    const env = plainToInstance(EnvironmentVariables, {
      ...makeValidEnv(),
      NODE_ENV: 'development',
      GEMINI_API_KEY: 'your_gemini_api_key_here',
      JWT_SECRET: 'your_jwt_secret_here',
      WHATSAPP_TOKEN: 'your_whatsapp_token_here',
      WHATSAPP_PHONE_NUMBER_ID: 'your_phone_number_id_here',
      WHATSAPP_APP_SECRET: 'your_app_secret_here',
      WHATSAPP_VERIFY_TOKEN: 'your_verify_token_here',
    });

    const errors = await validate(env);
    expect(errors).toHaveLength(0);
  });
});
