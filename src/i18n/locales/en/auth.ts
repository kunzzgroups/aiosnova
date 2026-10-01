export const auth: Record<string, string> = {
  // migrated from the former authCopy.ts
  'auth.emailLogin': 'Email',
  'auth.phoneLogin': 'Mobile',
  'auth.email': 'Email',
  'auth.phone': 'Phone number',
  'auth.enterEmail': 'Enter your email',
  'auth.countryCode': 'Country code',
  'auth.enterPhone': 'e.g. 12-345 0001',
  'auth.emailCode': 'Email Code',
  'auth.enterEmailCode': 'Enter 6-digit Email Code',
  'auth.tac': 'SMS Code',
  'auth.enterTac': 'Enter 6-digit SMS Code',
  'auth.sendTac': 'Send OTP',
  'auth.sendingTac': 'Sending OTP…',
  'auth.resendTac': 'Resend OTP',
  'auth.signInButton': 'Sign In',
  'auth.signingIn': 'Signing in…',
  'auth.orSignInWith': 'Or sign in with',
  'auth.continueWithGoogle': 'Continue with Google',
  'auth.continueWithApple': 'Continue with Apple',
  'auth.forgotTitle': 'Forgot password',
  'auth.forgotSubtitle': 'We will email reset instructions if an account exists.',
  'auth.rememberedIt': 'Remembered it?',
  'auth.backToSignIn': 'Back to sign in',
  'auth.sendResetLink': 'Send reset link',
  'auth.sending': 'Sending…',
  'auth.demoResetLink': 'Demo reset link:',
  'auth.continueToReset': 'Continue to reset',

  // aria labels
  'auth.signInMethod': 'Sign-in method',
  'auth.socialSignIn': 'Social sign-in',

  // OAuth
  'auth.oauthStartFailed': 'Unable to start {{provider}} sign-in.',
  'auth.oauthUnsupportedProvider': 'Unsupported sign-in provider.',
  'auth.oauthFailed': '{{provider}} sign-in failed.',

  // MFA setup
  'auth.preparingSetup': 'Preparing setup…',
  'auth.recoveryCodes': 'Recovery codes',
  'auth.recoveryCodesHint': 'Store these recovery codes securely. Each code can be used once.',
  'auth.disableMfaHint': 'Enter the current authenticator code to turn MFA off. Demo code: 123456',
  'auth.mfaCode': 'MFA code',

  // MFA challenge
  'auth.twoFactorTitle': 'Two-factor authentication',
  'auth.twoFactorSubtitle': 'Enter the 6-digit code from your authenticator app.',
  'auth.demoMfaCode': 'Demo MFA code: 123456',
  'auth.verificationCode': 'Verification code',
  'auth.verifying': 'Verifying…',
  'auth.verify': 'Verify',

  // reset password
  'auth.resetPasswordTitle': 'Reset password',
  'auth.resetPasswordSubtitle': 'Choose a new password for your account.',
  'auth.missingResetToken': 'Missing reset token. Request a new link.',
  'auth.newPassword': 'New password',
  'auth.confirmPassword': 'Confirm password',
  'auth.updating': 'Updating…',
  'auth.updatePassword': 'Update password',
  'auth.resetLinkInvalid': 'Reset link is invalid or expired.',
  'auth.resetFailed': 'Unable to reset password.',
}
