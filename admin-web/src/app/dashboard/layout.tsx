import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { SOSAlertListener } from "@/components/sos-alert-listener"
import { GlobalSearch } from "@/components/global-search"
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts"
import { QuickStatsBar } from "@/components/quick-stats-bar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <SOSAlertListener />
      <GlobalSearch />
      <KeyboardShortcuts />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <QuickStatsBar />
        <main className="flex-1 overflow-auto bg-muted/30 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
