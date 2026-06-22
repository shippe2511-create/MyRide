import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { SOSAlertListener } from "@/components/sos-alert-listener"
import { GlobalSearch } from "@/components/global-search"
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts"

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
      <div className="flex flex-1 flex-col overflow-hidden pl-6 pr-6">
        <div className="flex items-center justify-end py-3">
          <Header />
        </div>
        <main className="flex-1 overflow-auto pb-6">
          {children}
        </main>
      </div>
    </div>
  )
}
