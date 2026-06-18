'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, RefreshCw, User, Car, MapPin, AlertTriangle, Settings } from 'lucide-react'
import { format } from 'date-fns'

interface ActivityLog {
  id: string
  action: string
  entity_type: string
  entity_id: string
  details: Record<string, unknown>
  admin_id: string
  admin_name: string
  created_at: string
}

const entityIcons: Record<string, React.ElementType> = {
  customer: User,
  driver: Car,
  ride: MapPin,
  sos: AlertTriangle,
  settings: Settings,
}

const actionColors: Record<string, string> = {
  create: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  update: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  delete: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  view: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
}

export default function ActivityPage() {
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState<string>('all')

  const loadActivities = async () => {
    setLoading(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (!error && data) {
      setActivities(data)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadActivities()
  }, [])

  const filteredActivities = activities.filter(activity => {
    const matchesSearch = search === '' ||
      activity.action.toLowerCase().includes(search.toLowerCase()) ||
      activity.entity_type.toLowerCase().includes(search.toLowerCase()) ||
      activity.admin_name.toLowerCase().includes(search.toLowerCase())

    const matchesEntity = entityFilter === 'all' || activity.entity_type === entityFilter

    return matchesSearch && matchesEntity
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Activity Log
          </h1>
          <p className="text-sm text-muted-foreground">Track all admin actions and changes</p>
        </div>
        <Button onClick={loadActivities} variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search activities..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="customer">Customers</SelectItem>
                <SelectItem value="driver">Drivers</SelectItem>
                <SelectItem value="ride">Rides</SelectItem>
                <SelectItem value="sos">SOS</SelectItem>
                <SelectItem value="settings">Settings</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 bg-muted rounded" />
                    <div className="h-3 w-32 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No activity logs yet</p>
              <p className="text-sm mt-1">Actions like approving customers or updating settings will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredActivities.map((activity) => {
                const Icon = entityIcons[activity.entity_type] || Settings
                const colorClass = actionColors[activity.action] || actionColors.view

                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{activity.admin_name}</span>
                        <Badge variant="outline" className={colorClass}>
                          {activity.action}
                        </Badge>
                        <Badge variant="secondary">
                          {activity.entity_type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {activity.action === 'update' && `Updated ${activity.entity_type}`}
                        {activity.action === 'create' && `Created new ${activity.entity_type}`}
                        {activity.action === 'delete' && `Deleted ${activity.entity_type}`}
                        {activity.action === 'view' && `Viewed ${activity.entity_type}`}
                        {activity.entity_id && ` (ID: ${activity.entity_id.slice(0, 8)}...)`}
                      </p>
                      {activity.details && Object.keys(activity.details).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {JSON.stringify(activity.details).slice(0, 100)}
                        </p>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(activity.created_at), 'MMM d, h:mm a')}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
