'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signIn, authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Required'),
})
type LoginInput = z.infer<typeof loginSchema>

const totpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})
type TotpInput = z.infer<typeof totpSchema>

export default function LoginPage() {
  const router = useRouter()
  const [needsTotp, setNeedsTotp] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const totpForm = useForm<TotpInput>({
    resolver: zodResolver(totpSchema),
    defaultValues: { code: '' },
  })

  async function onLogin(input: LoginInput) {
    setError(null)
    const result = await signIn.email({
      email: input.email,
      password: input.password,
    })
    if (result.error) {
      setError(result.error.message ?? 'Sign-in failed')
      return
    }
    const data = result.data as { twoFactorRedirect?: boolean } | null
    if (data?.twoFactorRedirect) {
      setNeedsTotp(true)
      return
    }
    router.push('/')
    router.refresh()
  }

  async function onTotp(input: TotpInput) {
    setError(null)
    const result = await authClient.twoFactor.verifyTotp({ code: input.code })
    if (result.error) {
      setError(result.error.message ?? 'Verification failed')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="rounded-lg border bg-background p-6 shadow-sm">
      <h1 className="text-2xl font-bold tracking-tight">Sign in to CXAllies</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Use your owner credentials to continue.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {!needsTotp ? (
        <form onSubmit={loginForm.handleSubmit(onLogin)} className="mt-6 space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...loginForm.register('email')}
            />
            {loginForm.formState.errors.email && (
              <p className="text-xs text-red-600">{loginForm.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...loginForm.register('password')}
            />
            {loginForm.formState.errors.password && (
              <p className="text-xs text-red-600">
                {loginForm.formState.errors.password.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loginForm.formState.isSubmitting}>
            {loginForm.formState.isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      ) : (
        <form onSubmit={totpForm.handleSubmit(onTotp)} className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app.
          </p>
          <div className="space-y-1">
            <label htmlFor="code" className="text-sm font-medium">
              Verification code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...totpForm.register('code')}
            />
            {totpForm.formState.errors.code && (
              <p className="text-xs text-red-600">{totpForm.formState.errors.code.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={totpForm.formState.isSubmitting}>
            {totpForm.formState.isSubmitting ? 'Verifying...' : 'Verify'}
          </Button>
        </form>
      )}
    </div>
  )
}
