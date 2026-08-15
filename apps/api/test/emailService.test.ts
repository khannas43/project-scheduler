import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/env.js', () => ({
  env: {
    SMTP_HOST: '',
    SMTP_PORT: 587,
    SMTP_SECURE: 'false',
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_FROM: '',
    APP_BASE_URL: 'http://localhost:5173',
  },
}));

const { isEmailConfigured, sendMail } = await import('../src/services/emailService.js');

describe('emailService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is not configured without SMTP_HOST', () => {
    expect(isEmailConfigured()).toBe(false);
  });

  it('logs and reports delivered=false when SMTP is unset', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const result = await sendMail({
      to: 'planner@example.com',
      subject: 'Task reminder',
      text: 'Please update progress',
    });
    expect(result).toEqual({ delivered: false, to: 'planner@example.com' });
    expect(info).toHaveBeenCalled();
  });
});
