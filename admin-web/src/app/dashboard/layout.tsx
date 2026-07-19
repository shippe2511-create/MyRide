"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { SOSAlertListener } from "@/components/sos-alert-listener"
import { SupportChatListener } from "@/components/support-chat-listener"
import { GlobalSearch } from "@/components/global-search"
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts"
import { Menu, X } from "lucide-react"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const pathname = usePathname()

  // Detect mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false)
      }
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Persist sidebar state (desktop only)
  useEffect(() => {
    if (!isMobile) {
      const saved = localStorage.getItem("sidebar-collapsed")
      if (saved !== null) {
        setSidebarCollapsed(saved === "true")
      }
    }
  }, [isMobile])

  const handleCollapse = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed)
    localStorage.setItem("sidebar-collapsed", String(collapsed))
  }

  // Close mobile menu when navigating
  useEffect(() => {
    const handleRouteChange = () => setMobileMenuOpen(false)
    window.addEventListener("popstate", handleRouteChange)
    return () => window.removeEventListener("popstate", handleRouteChange)
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <SOSAlertListener />
      <SupportChatListener />
      <GlobalSearch />
      <KeyboardShortcuts />

      {/* Mobile menu overlay */}
      {isMobile && mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile unless menu open */}
      <div className={`
        ${isMobile ? 'fixed inset-y-0 left-0 z-50 transform transition-transform duration-300' : ''}
        ${isMobile && !mobileMenuOpen ? '-translate-x-full' : 'translate-x-0'}
      `}>
        <Sidebar
          collapsed={isMobile ? false : sidebarCollapsed}
          onCollapse={isMobile ? () => setMobileMenuOpen(false) : handleCollapse}
          onNavigate={() => setMobileMenuOpen(false)}
        />
      </div>

      <div className={`flex flex-1 flex-col overflow-hidden px-4 md:pl-6 md:pr-6 transition-all duration-300 ${!isMobile && sidebarCollapsed ? 'max-w-[calc(100vw-4rem)]' : !isMobile ? 'max-w-[calc(100vw-14rem)]' : 'max-w-full'}`}>
        <div className="flex items-center justify-between py-3 shrink-0">
          {/* Mobile menu button */}
          {isMobile && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-card text-foreground"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
          <div className={isMobile ? "flex-1 flex justify-end" : "flex-1 flex justify-end"}>
            <Header />
          </div>
        </div>
        <main className="flex-1 overflow-y-auto pb-6">
          {children}
        </main>
      </div>
    </div>
  )
}
