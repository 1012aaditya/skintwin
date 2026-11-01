import { Bell, Bookmark, Box, Camera, Layers, Settings as SettingsIcon, ShoppingBag, Sparkles, Sun } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, type ReactNode } from 'react'
import { Backdrop } from '@renderer/components/Backdrop'
import { Orb } from '@renderer/components/Orb'
import { Button, Spinner, Toaster } from '@renderer/components/ui'
import { cn } from '@renderer/lib/cn'
import { navigate, useRoute } from '@renderer/lib/router'
import { useSnapshot } from '@renderer/lib/store'
import { Analyze } from '@renderer/features/analysis/Analyze'
import { Compare } from '@renderer/features/compare/Compare'
import { Discover } from '@renderer/features/discover/Discover'
import { ProductInsights } from '@renderer/features/insights/ProductInsights'
import { Inventory } from '@renderer/features/inventory/Inventory'
import { Shop } from '@renderer/features/marketplace/Shop'
import { Onboarding } from '@renderer/features/onboarding/Onboarding'
import { Profile } from '@renderer/features/profile/Profile'
import { Progress } from '@renderer/features/progress/Progress'
import { Routine } from '@renderer/features/routine/Routine'
import { Saved } from '@renderer/features/saved/Saved'
import { Settings } from '@renderer/features/settings/Settings'
import { ErrorBoundary } from './ErrorBoundary'

const NAV: { path: string; label: string; icon: ReactNode; match?: string[] }[] = [
  { path: '/discover', label: 'Discover', icon: <Sparkles /> },
  { path: '/analyze', label: 'Analyze', icon: <Camera /> },
  { path: '/profile', label: 'Profile', icon: <Layers />, match: ['/progress'] },
  { path: '/routine', label: 'Routine', icon: <Sun /> },
  { path: '/inventory', label: 'Inventory', icon: <Box /> },
  { path: '/saved', label: 'Saved', icon: <Bookmark /> },
  { path: '/shop', label: 'Shop', icon: <ShoppingBag /> }
]

function TopNav() {
  const { path } = useRoute()
  const snap = useSnapshot()
  const alerts = snap ? snap.inventory.filter((i) => i.status === 'running_low').length : 0
  return (
    <header className="drag relative z-[var(--z-nav)] flex h-[76px] shrink-0 items-center gap-4 pr-6 pl-[92px]">
      <button className="no-drag flex items-center gap-2.5" onClick={() => navigate('/discover')} aria-label="SkinTwin home">
        <Orb size={40} ring={false} />
        <span className="text-[21px] font-semibold tracking-tight">SkinTwin</span>
      </button>
      <nav className="glass no-drag mx-auto flex items-center gap-0.5 rounded-pill p-1.5" aria-label="Main">
        {NAV.map((n) => {
          const active = path.startsWith(n.path) || n.match?.some((m) => path.startsWith(m))
          return (
            <button key={n.path} onClick={() => navigate(n.path)} className={cn('relative flex h-10 items-center gap-2 rounded-pill px-4 text-[14px] font-medium transition-colors', active ? 'text-white' : 'text-ink-soft hover:text-ink')} aria-current={active ? 'page' : undefined}>
              {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-pill bg-gradient-to-r from-lilac-400/70 to-[#c4a2ff]/70 shadow-glow" transition={{ type: 'spring', bounce: 0.18, duration: 0.5 }} />}
              <span className="relative flex items-center gap-2 [&_svg]:h-[17px] [&_svg]:w-[17px]">
                {n.icon}
                <span className="max-[1180px]:hidden">{n.label}</span>
              </span>
            </button>
          )
        })}
      </nav>
      <div className="no-drag flex items-center gap-2">
        <Button size="icon" variant="glass" aria-label={alerts ? `${alerts} products running low` : 'No alerts'} onClick={() => navigate('/inventory')} className="relative">
          <Bell className="h-4 w-4" />
          {alerts > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-400" />}
        </Button>
        <Button size="icon" variant="glass" aria-label="Settings" onClick={() => navigate('/settings')}>
          <SettingsIcon className="h-4 w-4" />
        </Button>
        <Button variant="primary" size="md" onClick={() => window.skintwin.companion.show()}>
          <Sparkles className="h-4 w-4" /> Companion
        </Button>
      </div>
    </header>
  )
}

function Screen() {
  const { segments, path } = useRoute()
  const [first, second] = segments
  let content: ReactNode
  switch (first) {
    case 'analyze':
      content = <Analyze />
      break
    case 'profile':
      content = <Profile />
      break
    case 'progress':
      content = <Progress />
      break
    case 'routine':
      content = <Routine />
      break
    case 'inventory':
      content = <Inventory />
      break
    case 'saved':
      content = <Saved />
      break
    case 'shop':
      content = <Shop />
      break
    case 'product':
      content = <ProductInsights productId={decodeURIComponent(second ?? '')} />
      break
    case 'compare':
      content = <Compare />
      break
    case 'settings':
      content = <Settings />
      break
    default:
      content = <Discover />
  }
  return (
    <ErrorBoundary resetKey={path}>
      <motion.main key={first} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="mx-auto w-full max-w-[1500px] px-8 pt-2 pb-10">
        {content}
      </motion.main>
    </ErrorBoundary>
  )
}

export function App() {
  const snap = useSnapshot()
  const { path } = useRoute()
  useEffect(() => window.skintwin.app.onNavigate((route) => navigate(route)), [])
  useEffect(() => {
    document.querySelector('.scroll-area')?.scrollTo({ top: 0 })
  }, [path])

  if (!snap)
    return (
      <div className="grid h-full place-items-center">
        <Backdrop />
        <Spinner className="h-8 w-8" />
      </div>
    )

  if (!snap.onboarding.completed)
    return (
      <>
        <Backdrop />
        <Onboarding />
        <Toaster />
      </>
    )

  return (
    <div className="flex h-full flex-col">
      <Backdrop />
      <TopNav />
      <div className="scroll-area min-h-0 flex-1">
        <Screen />
      </div>
      <Toaster />
    </div>
  )
}
