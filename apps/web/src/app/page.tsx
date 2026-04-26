import { Button } from '@/components/ui/Button'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">CXAllies</h1>
      <p className="text-muted-foreground">Intelligent AI/ERP Solutions — Phase 1</p>
      <Button>Get started</Button>
    </main>
  )
}
