'use strict';

describe('POS pilot environment validation', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    jest.resetModules();
  });

  test('defaults the local Mesita-app gateway to port 3000', () => {
    process.env.NODE_ENV = 'development';
    process.env.POS_PILOT_ENABLED = 'true';
    delete process.env.MESITA_APP_GATEWAY_URL;
    jest.resetModules();
    const env = require('../src/config/env');
    expect(env.MESITA_APP_GATEWAY_URL).toBe('http://localhost:3000');
    expect(env.POS_PILOT_GATEWAY_TIMEOUT_MS).toBe(180_000);
    expect(env.POS_PILOT_CONFIG_ERROR).toBeNull();
  });

  test('fails closed for missing or insecure production gateway URLs', () => {
    process.env.NODE_ENV = 'production';
    process.env.POS_PILOT_ENABLED = 'true';
    delete process.env.MESITA_APP_GATEWAY_URL;
    jest.resetModules();
    let env = require('../src/config/env');
    expect(env.POS_PILOT_CONFIG_ERROR).toMatch(/required/i);

    process.env.MESITA_APP_GATEWAY_URL = 'http://mesita.example';
    jest.resetModules();
    env = require('../src/config/env');
    expect(env.POS_PILOT_CONFIG_ERROR).toMatch(/https/i);
  });

  test('clamps the gateway timeout to the supported range', () => {
    process.env.NODE_ENV = 'test';
    process.env.POS_PILOT_ENABLED = 'true';
    process.env.MESITA_APP_GATEWAY_URL = 'https://gateway.mesita.test';
    process.env.POS_PILOT_GATEWAY_TIMEOUT_MS = '999999';
    jest.resetModules();
    const env = require('../src/config/env');
    expect(env.POS_PILOT_GATEWAY_TIMEOUT_MS).toBe(300_000);
  });
});
