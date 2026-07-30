import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
  useNavigate: () => vi.fn(),
}));

vi.mock('../hooks/useAuth.js', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    login: vi.fn().mockRejectedValue(new Error('Invalid credentials')),
    logout: vi.fn(),
    bootstrapped: true,
    accessToken: null,
    user: null,
  }),
}));

import { LoginPage } from './LoginPage.js';

describe('LoginPage', () => {
  it('renders the sign-in form', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();
  });

  it('shows an error when login fails', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid credentials/i);
  });

  it('toggles password visibility with the eye button', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const password = screen.getByLabelText(/^password$/i);
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide password/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(password).toHaveAttribute('type', 'password');
  });
});
