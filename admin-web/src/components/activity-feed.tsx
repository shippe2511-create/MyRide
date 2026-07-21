"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Car, UserPlus, AlertTriangle, CheckCircle, XCircle,
  Star, Activity
} from "lucide-react"

interface ActivityItem {
  id: string
  type: string
  message: string
  time: string
  icon: typeof Car
  color: string
}

export function ActivityFeed() {
  const supabase = createClient()
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadActivities()

    const channel = supabase
      .channel('activity_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rides' }, (payload) => {
        addActivity({
          type: 'ride',
          message: `New ride requested`,
          icon: Car,
          color: 'text-blue-500'
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides' }, (payload) => {
        const status = payload.new?.status
        if (status === 'completed') {
          addActivity({
            type: 'ride',
            message: `Ride completed`,
            icon: CheckCircle,
            color: 'text-green-500'
          })
        } else if (status === 'cancelled') {
          addActivity({
            type: 'ride',
            message: `Ride cancelled`,
            icon: XCircle,
            color: 'text-red-500'
          })
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_alerts' }, () => {
        addActivity({
          type: 'sos',
          message: `SOS Alert triggered!`,
          icon: AlertTriangle,
          color: 'text-red-500'
        })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ratings' }, () => {
        addActivity({
          type: 'rating',
          message: `New rating received`,
          icon: Star,
          color: 'text-yellow-500'
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const addActivity = (item: Omit<ActivityItem, 'id' | 'time'>) => {
    const newItem: ActivityItem = {
      ...item,
      id: Date.now().toString(),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }
    setActivities(prev => [newItem, ...prev].slice(0, 20))
  }

  const loadActivities = async () => {
    const [ridesRes, sosRes, ratingsRes] = await Promise.all([
      supabase.from('rides').select('id, status, created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('sos_alerts').select('id, status, created_at').order('created_at', { ascending: false }).limit(3),
      supabase.from('ratings').select('id, rating, created_at').order('created_at', { ascending: false }).limit(3),
    ])

    const items: ActivityItem[] = []

    ;(ridesRes.data || []).forEach(r => {
      items.push({
        id: r.id,
        type: 'ride',
        message: r.status === 'completed' ? 'Ride completed' : r.status === 'cancelled' ? 'Ride cancelled' : 'Ride requested',
        time: new Date(r.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        icon: r.status === 'completed' ? CheckCircle : r.status === 'cancelled' ? XCircle : Car,
        color: r.status === 'completed' ? 'text-green-500' : r.status === 'cancelled' ? 'text-red-500' : 'text-blue-500'
      })
    })

    ;(sosRes.data || []).forEach(s => {
      items.push({
        id: s.id,
        type: 'sos',
        message: 'SOS Alert',
        time: new Date(s.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        icon: AlertTriangle,
        color: 'text-red-500'
      })
    })

    ;(ratingsRes.data || []).forEach(r => {
      items.push({
        id: r.id,
        type: 'rating',
        message: `${r.rating} star rating`,
        time: new Date(r.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        icon: Star,
        color: 'text-yellow-500'
      })
    })

    items.sort((a, b) => b.id.localeCompare(a.id))
    setActivities(items.slice(0, 15))
    setLoading(false)
  }

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4" />
          <span className="font-semibold text-sm">Live Activity</span>
        </div>
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted" />
              <div className="flex-1 space-y-1">
                <div className="w-24 h-3 bg-muted rounded" />
                <div className="w-12 h-2 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="relative">
          <Activity className="h-4 w-4" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        </div>
        <span className="font-semibold text-sm">Live Activity</span>
      </div>
      <ScrollArea className="h-[300px]">
        <div className="space-y-3">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
          ) : (
            activities.map(item => {
              const Icon = item.icon
              return (
                <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className={`w-8 h-8 rounded-lg bg-muted flex items-center justify-center ${item.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.message}</p>
                    <p className="text-xs text-muted-foreground">{item.time}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
    </Card>
  )
}
