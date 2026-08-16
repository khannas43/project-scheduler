import { signAccessToken } from '../../src/lib/jwt.js';

export const TEST_USER_ID = '00000000-0000-4000-8000-000000000099';
export const TEST_USER_EMAIL = 'u@example.com';
export const TEST_PROJECT_ID = '00000000-0000-4000-8000-000000000001';

export async function bearerAuth(
  userId: string = TEST_USER_ID,
  email: string = TEST_USER_EMAIL,
): Promise<{ authorization: string }> {
  const token = await signAccessToken(userId, email);
  return { authorization: `Bearer ${token}` };
}
