'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc/client'
import { useFormWithAction } from '@/lib/forms/use-form-with-action'
import { updateOrganizationEmailConfig } from '../actions/organization-email-config'
import { updateOrganizationEmailConfigSchema } from '../actions/organization-email-config'
import type { UpdateOrganizationEmailConfigInput } from '../actions/organization-email-config'

type FormValues = UpdateOrganizationEmailConfigInput

export function OrganizationEmailForm() {
  const utils = trpc.useUtils()
  const query = trpc.parties.organization.getEmailConfig.useQuery()

  const form = useForm<FormValues>({
    resolver: zodResolver(updateOrganizationEmailConfigSchema),
    defaultValues: {
      emailSenderDomain: '',
      emailSenderAddress: '',
      emailSenderName: '',
      postmarkMessageStream: 'outbound',
    },
  })

  // Pre-fill the form once the org row arrives.
  useEffect(() => {
    if (query.data) {
      form.reset({
        emailSenderDomain: query.data.emailSenderDomain ?? '',
        emailSenderAddress: query.data.emailSenderAddress ?? '',
        emailSenderName: query.data.emailSenderName ?? '',
        postmarkMessageStream: query.data.postmarkMessageStream ?? 'outbound',
      })
    }
  }, [query.data, form])

  const { submit, submitting } = useFormWithAction({
    form,
    action: updateOrganizationEmailConfig,
    successMessage: 'Email settings saved',
    onSuccess: async () => {
      await utils.parties.organization.getEmailConfig.invalidate()
    },
  })

  if (query.isLoading) {
    return <Skeleton className="h-72 w-full" />
  }

  if (query.error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load email settings: {query.error.message}
      </p>
    )
  }

  if (!query.data) return null

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Outbound email identity</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These values appear in the From header of every invoice email
          {' '}
          {query.data.displayName} sends. Saved here, not in env vars — the
          server reads this row at every send.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="emailSenderName">Sender name</Label>
        <Input
          id="emailSenderName"
          placeholder="CXAllies"
          {...form.register('emailSenderName')}
        />
        <p className="text-xs text-muted-foreground">
          Shown to recipients before the email address — e.g.,{' '}
          <span className="font-mono">CXAllies &lt;invoices@cxallies.com&gt;</span>.
        </p>
        {form.formState.errors.emailSenderName && (
          <p className="text-sm text-destructive">
            {form.formState.errors.emailSenderName.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="emailSenderAddress">Sender address</Label>
        <Input
          id="emailSenderAddress"
          inputMode="email"
          placeholder="invoices@cxallies.com"
          {...form.register('emailSenderAddress')}
        />
        <p className="text-xs text-muted-foreground">
          Must be a verified sender in your Postmark account before
          production sends. Sandbox token (POSTMARK_API_TEST) accepts any
          address.
        </p>
        {form.formState.errors.emailSenderAddress && (
          <p className="text-sm text-destructive">
            {form.formState.errors.emailSenderAddress.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="emailSenderDomain">Sender domain</Label>
        <Input
          id="emailSenderDomain"
          placeholder="cxallies.com"
          {...form.register('emailSenderDomain')}
        />
        <p className="text-xs text-muted-foreground">
          Informational. DKIM / SPF / DMARC verification UI lands in
          Phase 2 — for now, set this to whatever Postmark tells you the
          verified domain is.
        </p>
        {form.formState.errors.emailSenderDomain && (
          <p className="text-sm text-destructive">
            {form.formState.errors.emailSenderDomain.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="postmarkMessageStream">Postmark message stream</Label>
        <Input
          id="postmarkMessageStream"
          placeholder="outbound"
          {...form.register('postmarkMessageStream')}
        />
        <p className="text-xs text-muted-foreground">
          The Postmark stream invoice emails are sent on. The default
          transactional stream is <span className="font-mono">outbound</span>.
        </p>
        {form.formState.errors.postmarkMessageStream && (
          <p className="text-sm text-destructive">
            {form.formState.errors.postmarkMessageStream.message}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save email settings
        </Button>
      </div>
    </form>
  )
}
