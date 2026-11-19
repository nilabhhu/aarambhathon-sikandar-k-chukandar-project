export type AppRoute =
  | '/'
  | '/simple'
  | '/advanced'
  | '/architecture'
  | '/auth'
  | '/privacy'
  | '/terms'
  | '/cookies';

export const PUBLIC_ROUTES: ReadonlySet<AppRoute> = new Set<AppRoute>([
  '/',
  '/auth',
  '/privacy',
  '/terms',
  '/cookies',
]);

export const PROTECTED_ROUTES: ReadonlySet<AppRoute> = new Set<AppRoute>([
  '/simple',
  '/advanced',
  '/architecture',
]);

export function parseAppRoute(pathname: string): AppRoute {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  if (clean.startsWith('/simple')) return '/simple';
  if (clean.startsWith('/advanced')) return '/advanced';
  if (clean.startsWith('/architecture')) return '/architecture';
  if (clean.startsWith('/auth')) return '/auth';
  if (clean.startsWith('/privacy')) return '/privacy';
  if (clean.startsWith('/terms')) return '/terms';
  if (clean.startsWith('/cookies')) return '/cookies';
  return '/';
}

export function isProtectedRoute(route: AppRoute): boolean {
  return PROTECTED_ROUTES.has(route);
}

/**
 * Sanitizes post-login redirect targets to internal studio routes only,
 * preventing open-redirect vulnerabilities.
 */
export function sanitizeReturnTo(candidate: string | null | undefined): AppRoute {
  if (!candidate || typeof candidate !== 'string') return '/simple';
  const trimmed = candidate.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/simple';
  const parsed = parseAppRoute(trimmed);
  if (parsed === '/auth') return '/simple';
  return parsed;
}

export interface AuthFormValidationInput {
  mode: 'login' | 'signup';
  email: string;
  password: string;
  displayName?: string;
  legalConsentAccepted?: boolean;
}

export interface AuthFormValidationResult {
  valid: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAuthForm(input: AuthFormValidationInput): AuthFormValidationResult {
  const email = input.email.trim();
  if (!email || !EMAIL_RE.test(email)) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  if (!input.password || input.password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (input.mode === 'signup') {
    if (!input.legalConsentAccepted) {
      return {
        valid: false,
        error: 'You must agree to the Privacy Policy and Terms & Conditions before creating an account.',
      };
    }
  }
  return { valid: true };
}
