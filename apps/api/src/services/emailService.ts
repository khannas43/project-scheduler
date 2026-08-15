import nodemailer from 'nodemailer';

import { env } from '../env.js';

export interface SendMailInput {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface SendMailResult {
  readonly delivered: boolean;
  readonly to: string;
}

export function isEmailConfigured(): boolean {
  return env.SMTP_HOST.trim() !== '' && env.SMTP_FROM.trim() !== '';
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  if (!isEmailConfigured()) {
    console.info(`[email:dry-run] to=${input.to} subject=${input.subject}\n${input.text}`);
    return { delivered: false, to: input.to };
  }

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === 'true',
    ...(env.SMTP_USER
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
      : {}),
  });

  await transport.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });

  return { delivered: true, to: input.to };
}
