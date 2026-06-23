"use client"

import { useState, useEffect } from "react"
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Persist sidebar state
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed")
    if (saved !== null) {
      setSidebarCollapsed(saved === "true")
    }
  }, [])

  const handleCollapse = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed)
    localStorage.setItem("sidebar-collapsed", String(collapsed))
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <SOSAlertListener />
      <GlobalSearch />
      <KeyboardShortcuts />
      <Sidebar collapsed={sidebarCollapsed} onCollapse={handleCollapse} />
      <div className={`flex flex-1 flex-col overflow-hidden pl-6 pr-6 transition-all duration-300 ${sidebarCollapsed ? 'max-w-[calc(100vw-4rem)]' : 'max-w-[calc(100vw-14rem)]'}`}>
        <div className="flex items-center justify-end py-3 shrink-0">
          <Header />
        </div>
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-6">
          {children}
        </main>
      </div>
    </div>
  )
}
