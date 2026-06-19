"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Users, Car, MapPin, Shield, Settings, BarChart3, Calendar,
  MessageSquare, Star, FileText, Bell, Map, ClipboardCheck, Ticket
} from "lucide-react"

interface SearchResult {
  id: string
  type: "customer" | "driver" | "ride" | "route"
  title: string
  subtitle: string
}

const PAGES = [
  { name: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { name: "Customers", href: "/dashboard/customers", icon: Users },
  { name: "Drivers", href: "/dashboard/drivers", icon: Car },
  { name: "Vehicles", href: "/dashboard/vehicles", icon: Car },
  { name: "Rides", href: "/dashboard/rides", icon: MapPin },
  { name: "Live Tracking", href: "/dashboard/tracking", icon: Map },
  { name: "Schedules", href: "/dashboard/scheduling", icon: Calendar },
  { name: "Pre-trip Checks", href: "/dashboard/checklists", icon: ClipboardCheck },
  { name: "Eligibility", href: "/dashboard/eligibility", icon: Ticket },
  { name: "Content", href: "/dashboard/content", icon: FileText },
  { name: "App Config", href: "/dashboard/app-config", icon: Settings },
  { name: "Service Zones", href: "/dashboard/zones", icon: Map },
  { name: "Chat", href: "/dashboard/chat", icon: MessageSquare },
  { name: "SOS Alerts", href: "/dashboard/sos", icon: Shield },
  { name: "Ratings", href: "/dashboard/ratings", icon: Star },
  { name: "Reports", href: "/dashboard/reports", icon: FileText },
  { name: "Admins", href: "/dashboard/admins", icon: Users },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

export function GlobalSearch() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    const searchResults: SearchResult[] = []

    try {
      const [customersRes, driversRes, ridesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, phone, role")
          .eq("role", "customer")
          .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
          .limit(5),
        supabase
          .from("profiles")
          .select("id, full_name, phone, role")
          .eq("role", "driver")
          .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
          .limit(5),
        supabase
          .from("rides")
          .select("id, pickup_name, dropoff_name, status")
          .or(`pickup_name.ilike.%${q}%,dropoff_name.ilike.%${q}%`)
          .limit(5),
      ])

      if (customersRes.data) {
        customersRes.data.forEach((c) => {
          searchResults.push({
            id: c.id,
            type: "customer",
            title: c.full_name || "Unknown",
            subtitle: c.phone || "No phone",
          })
        })
      }

      if (driversRes.data) {
        driversRes.data.forEach((d) => {
          searchResults.push({
            id: d.id,
            type: "driver",
            title: d.full_name || "Unknown",
            subtitle: d.phone || "No phone",
          })
        })
      }

      if (ridesRes.data) {
        ridesRes.data.forEach((r) => {
          searchResults.push({
            id: r.id,
            type: "ride",
            title: `${r.pickup_name} → ${r.dropoff_name}`,
            subtitle: r.status,
          })
        })
      }
    } catch (e) {
      console.error("Search error:", e)
    }

    setResults(searchResults)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) search(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, search])

  const handleSelect = (result: SearchResult) => {
    setOpen(false)
    setQuery("")
    switch (result.type) {
      case "customer":
        router.push(`/dashboard/customers?search=${encodeURIComponent(result.title)}`)
        break
      case "driver":
        router.push(`/dashboard/drivers?search=${encodeURIComponent(result.title)}`)
        break
      case "ride":
        router.push(`/dashboard/rides?search=${encodeURIComponent(result.title)}`)
        break
    }
  }

  const handlePageSelect = (href: string) => {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  const filteredPages = PAGES.filter((page) =>
    page.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search customers, drivers, rides, or pages..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{loading ? "Searching..." : "No results found."}</CommandEmpty>

        {results.length > 0 && (
          <>
            {results.filter(r => r.type === "customer").length > 0 && (
              <CommandGroup heading="Customers">
                {results.filter(r => r.type === "customer").map((result) => (
                  <CommandItem
                    key={result.id}
                    onSelect={() => handleSelect(result)}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    <div>
                      <p>{result.title}</p>
                      <p className="text-xs text-muted-foreground">{result.subtitle}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.filter(r => r.type === "driver").length > 0 && (
              <CommandGroup heading="Drivers">
                {results.filter(r => r.type === "driver").map((result) => (
                  <CommandItem
                    key={result.id}
                    onSelect={() => handleSelect(result)}
                  >
                    <Car className="mr-2 h-4 w-4" />
                    <div>
                      <p>{result.title}</p>
                      <p className="text-xs text-muted-foreground">{result.subtitle}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.filter(r => r.type === "ride").length > 0 && (
              <CommandGroup heading="Rides">
                {results.filter(r => r.type === "ride").map((result) => (
                  <CommandItem
                    key={result.id}
                    onSelect={() => handleSelect(result)}
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    <div>
                      <p className="text-sm">{result.title}</p>
                      <p className="text-xs text-muted-foreground">{result.subtitle}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Pages">
          {filteredPages.slice(0, 8).map((page) => (
            <CommandItem
              key={page.href}
              onSelect={() => handlePageSelect(page.href)}
            >
              <page.icon className="mr-2 h-4 w-4" />
              {page.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
