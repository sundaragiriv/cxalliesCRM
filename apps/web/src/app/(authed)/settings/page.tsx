import { Settings as SettingsIcon } from 'lucide-react'
import { ModulePlaceholder } from '../_placeholder'

export default function SettingsPage() {
  return (
    <ModulePlaceholder
      icon={SettingsIcon}
      title="Settings"
      ticketRange="P1-25"
      description="Brand system, organization settings, and the brand-palette swap that activates the data-brand CSS variables."
    />
  )
}
