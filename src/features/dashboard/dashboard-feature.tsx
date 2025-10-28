import { AppHero } from '@/components/app-hero.tsx'
import { ProtocolStats } from '../solignition/ui/protocol-stats'
import { useSolana } from '@/components/solana/use-solana';


export default function DashboardFeature() {
  const { account } = useSolana();
  return (
    <div>
      <AppHero title="Protocol Dashboard" subtitle="overall protocol statistics" />
      <ProtocolStats address={account?.address}/>
    </div>
  )
}
