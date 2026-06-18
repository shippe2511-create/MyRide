"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  MessageSquare, Search, User, Car, Clock, MapPin, Loader2, RefreshCw, ChevronRight
} from "lucide-react"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { Breadcrumbs } from "@/components/breadcrumbs"

interface ChatMessage {
  id: string
  ride_id: string
  sender_id: string
  receiver_id: string
  message: string
  sender_type: "customer" | "driver"
  is_read: boolean
  created_at: string
}

interface RideConversation {
  ride_id: string
  customer_name: string
  customer_avatar: string | null
  driver_name: string
  driver_avatar: string | null
  pickup_name: string | null
  dropoff_name: string | null
  ride_status: string
  message_count: number
  last_message: string
  last_message_time: string
  unread_count: number
}

export default function ChatPage() {
  const supabase = createClient()
  const [conversations, setConversations] = useState<RideConversation[]>([])
  const [selectedRide, setSelectedRide] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const [stats, setStats] = useState({
    totalConversations: 0,
    activeConversations: 0,
    totalMessages: 0,
    todayMessages: 0,
  })

  const loadConversations = useCallback(async () => {
    const { data: chatData, error: chatError } = await supabase
      .from("chat_messages")
      .select(`
        ride_id,
        message,
        created_at,
        is_read
      `)
      .order("created_at", { ascending: false })

    if (chatError) {
      console.error("Error loading chats:", chatError)
      setLoading(false)
      return
    }

    const rideIds = [...new Set((chatData || []).map(c => c.ride_id))]

    if (rideIds.length === 0) {
      setConversations([])
      setLoading(false)
      return
    }

    const { data: ridesData, error: ridesError } = await supabase
      .from("rides")
      .select(`
        id,
        status,
        pickup_name,
        dropoff_name,
        customer_id,
        driver_id
      `)
      .in("id", rideIds)

    if (ridesError) {
      console.error("Error loading rides:", ridesError)
    }

    // Fetch profiles separately for reliability
    const customerIds = (ridesData || []).map(r => r.customer_id).filter(Boolean)
    const driverIds = (ridesData || []).map(r => r.driver_id).filter(Boolean)

    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", customerIds)

    const { data: driversData } = await supabase
      .from("drivers")
      .select("id, profile:profiles(full_name, avatar_url)")
      .in("id", driverIds)

    const profilesMap = new Map((profilesData || []).map(p => [p.id, p]))
    const driversMap = new Map((driversData || []).map(d => [d.id, d]))

    const ridesMap = new Map((ridesData || []).map(r => [r.id, r]))

    const conversationMap = new Map<string, RideConversation>()

    for (const msg of chatData || []) {
      const ride = ridesMap.get(msg.ride_id)
      if (!ride) continue

      if (!conversationMap.has(msg.ride_id)) {
        const customer = profilesMap.get(ride.customer_id)
        const driverData = driversMap.get(ride.driver_id)
        const driverProfile = Array.isArray(driverData?.profile) ? driverData.profile[0] : driverData?.profile
        conversationMap.set(msg.ride_id, {
          ride_id: msg.ride_id,
          customer_name: customer?.full_name || "Unknown Customer",
          customer_avatar: customer?.avatar_url || null,
          driver_name: driverProfile?.full_name || "Unknown Driver",
          driver_avatar: driverProfile?.avatar_url || null,
          pickup_name: ride.pickup_name,
          dropoff_name: ride.dropoff_name,
          ride_status: ride.status,
          message_count: 0,
          last_message: msg.message,
          last_message_time: msg.created_at,
          unread_count: 0,
        })
      }

      const conv = conversationMap.get(msg.ride_id)!
      conv.message_count += 1
      if (!msg.is_read) conv.unread_count += 1
    }

    const convList = Array.from(conversationMap.values())
      .sort((a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime())

    setConversations(convList)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayMsgs = (chatData || []).filter(m => new Date(m.created_at) >= today).length
    const activeConvs = convList.filter(c => ["accepted", "in_progress", "arriving"].includes(c.ride_status)).length

    setStats({
      totalConversations: convList.length,
      activeConversations: activeConvs,
      totalMessages: chatData?.length || 0,
      todayMessages: todayMsgs,
    })

    setLoading(false)
  }, [supabase])

  const loadMessages = async (rideId: string) => {
    setMessagesLoading(true)
    setSelectedRide(rideId)

    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("ride_id", rideId)
      .order("created_at", { ascending: true })

    if (!error) {
      setMessages(data || [])
    }
    setMessagesLoading(false)
  }

  useEffect(() => {
    loadConversations()

    const channel = supabase
      .channel('chat-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
        loadConversations()
        if (selectedRide) loadMessages(selectedRide)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadConversations, supabase, selectedRide])

  const formatTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return "now"
    if (diffMins < 60) return `${diffMins}m`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h`
    return d.toLocaleDateString("en-US", { timeZone: "Indian/Maldives", month: "short", day: "numeric" })
  }

  const formatMessageTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", {
      timeZone: "Indian/Maldives",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "success"
      case "cancelled": return "destructive"
      case "in_progress": return "warning"
      case "accepted": return "default"
      default: return "secondary"
    }
  }

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch =
      conv.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      conv.driver_name.toLowerCase().includes(search.toLowerCase())

    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "active" && ["accepted", "in_progress", "arriving"].includes(conv.ride_status)) ||
      (statusFilter === "completed" && conv.ride_status === "completed") ||
      (statusFilter === "cancelled" && conv.ride_status === "cancelled")

    return matchesSearch && matchesStatus
  })

  const selectedConversation = conversations.find(c => c.ride_id === selectedRide)

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-48 h-9 bg-muted rounded animate-pulse" />
          <div className="w-80 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <MessageSquare className="h-8 w-8" />
            Chat Monitoring
          </h1>
          <p className="text-muted-foreground">
            View conversations between customers and drivers
          </p>
        </div>
        <Button variant="outline" onClick={() => loadConversations()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
              <MessageSquare className="h-4 w-4 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight">{stats.totalConversations}</p>
              <p className="text-xs text-muted-foreground truncate">Total Chats</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
              <Car className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-green-500">{stats.activeConversations}</p>
              <p className="text-xs text-muted-foreground truncate">Active Rides</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20 shrink-0">
              <MessageSquare className="h-4 w-4 text-purple-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-purple-500">{stats.totalMessages}</p>
              <p className="text-xs text-muted-foreground truncate">Total Messages</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 shrink-0">
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-blue-500">{stats.todayMessages}</p>
              <p className="text-xs text-muted-foreground truncate">Today</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle>Conversations</CardTitle>
            <div className="flex items-center gap-2 mt-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-28 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Done</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {filteredConversations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No conversations found</p>
                </div>
              ) : (
                filteredConversations.map(conv => (
                  <div
                    key={conv.ride_id}
                    className={`p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                      selectedRide === conv.ride_id ? "bg-muted" : ""
                    }`}
                    onClick={() => loadMessages(conv.ride_id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={conv.customer_avatar || undefined} />
                            <AvatarFallback>{conv.customer_name[0]}</AvatarFallback>
                          </Avatar>
                          <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background border flex items-center justify-center">
                            <Car className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{conv.customer_name}</p>
                            {conv.unread_count > 0 && (
                              <Badge variant="default" className="h-5 px-1.5 text-xs">
                                {conv.unread_count}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            with {conv.driver_name}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-muted-foreground">{formatTime(conv.last_message_time)}</p>
                        <Badge variant={getStatusColor(conv.ride_status) as "default" | "success" | "destructive" | "warning" | "secondary"} className="text-xs mt-1">
                          {conv.ride_status}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-1">
                      {conv.last_message}
                    </p>
                  </div>
                ))
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          {!selectedRide ? (
            <div className="flex items-center justify-center h-[580px] text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">Select a conversation</p>
                <p className="text-sm">Choose a ride from the list to view messages</p>
              </div>
            </div>
          ) : (
            <>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {selectedConversation?.customer_name} &amp; {selectedConversation?.driver_name}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <MapPin className="h-3 w-3" />
                      {selectedConversation?.pickup_name?.slice(0, 30)}...
                      <ChevronRight className="h-3 w-3" />
                      {selectedConversation?.dropoff_name?.slice(0, 30)}...
                    </CardDescription>
                  </div>
                  <Badge variant={getStatusColor(selectedConversation?.ride_status || "") as "default" | "success" | "destructive" | "warning" | "secondary"}>
                    {selectedConversation?.ride_status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-[450px]">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <ScrollArea className="h-[450px] p-4">
                    <div className="space-y-4">
                      {messages.map(msg => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.sender_type === "customer" ? "justify-start" : "justify-end"}`}
                        >
                          <div className={`flex gap-2 max-w-[70%] ${msg.sender_type === "customer" ? "flex-row" : "flex-row-reverse"}`}>
                            <Avatar className="h-8 w-8 flex-shrink-0">
                              <AvatarImage
                                src={msg.sender_type === "customer"
                                  ? selectedConversation?.customer_avatar || undefined
                                  : selectedConversation?.driver_avatar || undefined
                                }
                              />
                              <AvatarFallback>
                                {msg.sender_type === "customer" ? <User className="h-4 w-4" /> : <Car className="h-4 w-4" />}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div
                                className={`rounded-2xl px-4 py-2 ${
                                  msg.sender_type === "customer"
                                    ? "bg-muted rounded-tl-sm"
                                    : "bg-primary text-primary-foreground rounded-tr-sm"
                                }`}
                              >
                                <p className="text-sm">{msg.message}</p>
                              </div>
                              <p className={`text-xs text-muted-foreground mt-1 ${msg.sender_type === "customer" ? "" : "text-right"}`}>
                                {formatMessageTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
