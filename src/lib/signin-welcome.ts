export const SIGNIN_SEEN_KEY = 'forager:has-signed-in';

export const FIRST_VISIT_LINES = [
  'Turn leftover tokens into WLD.',
  'Pick the junk. Keep the WLD.',
  'A quiet ledger for leftover bags.',
] as const;

export const RETURNING_LINES = [
  'The brush saved you a seat.',
  'Another bag, same careful hands.',
  'Good to see you in the field again.',
  'The ledger is still open.',
] as const;

function pickLine(lines: readonly string[], salt: number): string {
  return lines[Math.abs(salt) % lines.length];
}

export function signInWelcomeLine(returning: boolean): string {
  const day = Math.floor(Date.now() / 86_400_000);
  return returning
    ? pickLine(RETURNING_LINES, day)
    : pickLine(FIRST_VISIT_LINES, day);
}

export function markSignedInBefore(): void {
  try {
    window.localStorage.setItem(SIGNIN_SEEN_KEY, '1');
  } catch {
    // private mode
  }
}

export function hasSignedInBefore(): boolean {
  try {
    return window.localStorage.getItem(SIGNIN_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
