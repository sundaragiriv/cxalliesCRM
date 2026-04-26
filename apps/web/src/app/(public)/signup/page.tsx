import Link from 'next/link'

export default function SignupPage() {
  return (
    <div className="rounded-lg border bg-background p-6 shadow-sm">
      <h1 className="text-2xl font-bold tracking-tight">Sign up</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        CXAllies is invitation-only. Contact your administrator to receive an invite.
      </p>
      <div className="mt-6">
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          ← Back to sign in
        </Link>
      </div>
    </div>
  )
}
