import { AppHero } from '@/components/app-hero.tsx'
import { ProtocolStats } from '../solignition/ui/protocol-stats'


export default function DashboardFeature() {
  return (
    <div>
      <AppHero title="Protocol Dashboard" subtitle="overall protocol statistics" />
      <ProtocolStats address=""/>
    </div>
  )
}
