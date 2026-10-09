'use client'
import DemoSettingsPanel from '@components/Demo/DemoSettingsPanel'
import StudioShell, { useDemoStudio } from '@components/Demo/Studio/StudioShell'

export default function DemoSettingsPage() {
  const { data, mutate } = useDemoStudio()
  return <StudioShell active="settings">
    {data?.settings ? <DemoSettingsPanel key={data.settings.revision} settings={data.settings} readyWorkspaces={data.ready_workspaces} onSaved={() => void mutate()} /> : null}
  </StudioShell>
}
