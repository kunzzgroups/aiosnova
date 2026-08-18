import { useLocaleStore } from '@/stores/localeStore'

const COPY = {
  en: {
    signInTitle: 'Sign In',
    email: 'Email',
    password: 'Password',
    enterEmail: 'Enter your email',
    enterPassword: 'Enter your password',
    rememberMe: 'Remember me',
    forgotPassword: 'Forgot password?',
    signInButton: 'Sign In',
    signingIn: 'Signing in…',
    orSignInWith: 'Or sign in with',
    forgotTitle: 'Forgot password',
    forgotSubtitle: 'We will email reset instructions if an account exists.',
    rememberedIt: 'Remembered it?',
    backToSignIn: 'Back to sign in',
    sendResetLink: 'Send reset link',
    sending: 'Sending…',
    demoResetLink: 'Demo reset link:',
    continueToReset: 'Continue to reset',
  },
  'zh-CN': {
    signInTitle: '登录',
    email: '邮箱',
    password: '密码',
    enterEmail: '请输入邮箱',
    enterPassword: '请输入密码',
    rememberMe: '记住我',
    forgotPassword: '忘记密码？',
    signInButton: '登录',
    signingIn: '登录中…',
    orSignInWith: '或使用以下方式登录',
    forgotTitle: '忘记密码',
    forgotSubtitle: '如果账号存在，我们会发送重置说明邮件。',
    rememberedIt: '想起来了？',
    backToSignIn: '返回登录',
    sendResetLink: '发送重置链接',
    sending: '发送中…',
    demoResetLink: '演示重置链接：',
    continueToReset: '继续重置',
  },
} as const

type AuthCopyKey = keyof (typeof COPY)['en']

export function useAuthCopy() {
  const locale = useLocaleStore((state) => state.locale)
  function t(key: AuthCopyKey) {
    return COPY[locale][key]
  }
  return { locale, t }
}
