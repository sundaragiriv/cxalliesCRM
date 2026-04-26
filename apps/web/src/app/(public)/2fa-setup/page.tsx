'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

const enableSchema = z.object({
  password: z.string().min(1, 'Required'),
})
type EnableInput = z.infer<typeof enableSchema>

const verifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})
type VerifyInput = z.infer<typeof verifySchema>

export default function TwoFactorSetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<'enable' | 'verify'>('enable')
  const [otpUri, setOtpUri] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const enableForm = useForm<EnableInput>({
    resolver: zodResolver(enableSchema),
    defaultValues: { password: '' },
  })
  const verifyForm = useForm<VerifyInput>({
    resolver: zodResolver(verifySchema),
    defaultValues: { code: '' },
  })

  useEffect(() => {
    enableForm.setFocus('password')
  }, [enableForm])

  async function onEnable(input: EnableInput) {
    setError(null)
    const result = await authClient.twoFactor.enable({ password: input.password })
    if (result.error) {
      setError(result.error.message ?? 'Could not enable 2FA')
      return
    }
    const data = result.data as { totpURI: string; backupCodes: string[] }
    setOtpUri(data.totpURI)
    setBackupCodes(data.backupCodes)
    setStep('verify')
  }

  async function onVerify(input: VerifyInput) {
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
      <h1 className="text-2xl font-bold tracking-tight">Set up two-factor authentication</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Required for the Owner role. You&apos;ll need an authenticator app like 1Password,
        Authy, or Google Authenticator.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {step === 'enable' && (
        <form onSubmit={enableForm.handleSubmit(onEnable)} className="mt-6 space-y-4">
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              Confirm your password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              {...enableForm.register('password')}
            />
            {enableForm.formState.errors.password && (
              <p className="text-xs text-red-600">
                {enableForm.formState.errors.password.message}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={enableForm.formState.isSubmitting}>
            {enableForm.formState.isSubmitting ? 'Generating...' : 'Generate code'}
          </Button>
        </form>
      )}

      {step === 'verify' && otpUri && (
        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Scan this URI with your authenticator app:</p>
            <code className="block break-all rounded bg-muted px-3 py-2 text-xs">{otpUri}</code>
          </div>

          {backupCodes && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Backup codes (save these somewhere safe — each is single-use):
              </p>
              <pre className="rounded bg-muted px-3 py-2 text-xs">
                {backupCodes.join('\n')}
              </pre>
            </div>
          )}

          <form onSubmit={verifyForm.handleSubmit(onVerify)} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="code" className="text-sm font-medium">
                Enter the 6-digit code from your app
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...verifyForm.register('code')}
              />
              {verifyForm.formState.errors.code && (
                <p className="text-xs text-red-600">
                  {verifyForm.formState.errors.code.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={verifyForm.formState.isSubmitting}>
              {verifyForm.formState.isSubmitting ? 'Verifying...' : 'Verify and finish'}
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
