export const auth: Record<string, string> = {
  'auth.signInWithEmailTitle': '使用邮箱登录',

  // migrated from the former authCopy.ts
  'auth.email': '邮箱',
  'auth.enterEmail': '请输入邮箱',
  'auth.emailCode': '邮箱验证码',
  'auth.enterEmailCode': '请输入 6 位邮箱验证码',
  'auth.sendTac': '发送 OTP',
  'auth.sendingTac': '发送中…',
  'auth.resendTac': '重新发送 OTP',
  'auth.signInButton': '登录',
  'auth.signingIn': '登录中…',
  'auth.orSignInWith': '或使用以下方式登录',
  'auth.continueWithGoogle': '使用 Google 继续',
  'auth.continueWithApple': '使用 Apple 继续',
  'auth.forgotTitle': '忘记密码',
  'auth.forgotSubtitle': '如果账号存在，我们会发送重置说明邮件。',
  'auth.rememberedIt': '想起来了？',
  'auth.backToSignIn': '返回登录',
  'auth.sendResetLink': '发送重置链接',
  'auth.sending': '发送中…',
  'auth.demoResetLink': '演示重置链接：',
  'auth.continueToReset': '继续重置',

  // aria labels
  'auth.socialSignIn': '第三方登录',

  // OAuth
  'auth.oauthStartFailed': '无法启动 {{provider}} 登录。',
  'auth.oauthUnsupportedProvider': '不支持的登录方式。',
  'auth.oauthFailed': '{{provider}} 登录失败。',

  // MFA setup
  'auth.preparingSetup': '正在准备设置…',
  'auth.recoveryCodes': '恢复码',
  'auth.recoveryCodesHint': '请妥善保存这些恢复码，每个恢复码只能使用一次。',
  'auth.disableMfaHint': '输入当前验证器验证码以关闭 MFA。演示验证码：123456',
  'auth.mfaCode': 'MFA 验证码',

  // MFA challenge
  'auth.twoFactorTitle': '双因素认证',
  'auth.twoFactorSubtitle': '请输入身份验证器应用中的 6 位验证码。',
  'auth.demoMfaCode': '演示 MFA 验证码：123456',
  'auth.verificationCode': '验证码',
  'auth.verifying': '验证中…',
  'auth.verify': '验证',

  // reset password
  'auth.resetPasswordTitle': '重置密码',
  'auth.resetPasswordSubtitle': '为你的账号设置新密码。',
  'auth.missingResetToken': '缺少重置令牌，请重新申请链接。',
  'auth.newPassword': '新密码',
  'auth.confirmPassword': '确认密码',
  'auth.updating': '更新中…',
  'auth.updatePassword': '更新密码',
  'auth.resetLinkInvalid': '重置链接无效或已过期。',
  'auth.resetFailed': '无法重置密码。',
}
