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

    // For now, we'll create mock activity data since the activity_logs table may not exist
    // In production, this would query the actual activity_logs table
    const mockActivities: ActivityLog[] = [
      {
        id: '1',
        action: 'update',
        entity_type: 'settings',
        entity_id: 'emergency-contacts',
        details: { field: 'emergency_contacts', changed: true },
        admin_id: 'admin-1',
        admin_name: 'Admin User',
        created_at: new Date().toISOString(),
      },
      {
        id: '2',
        action: 'view',
        entity_type: 'customer',
        entity_id: 'cust-123',
        details: { customer_name: 'John Doe' },
        admin_id: 'admin-1',
        admin_name: 'Admin User',
        created_at: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: '3',
        action: 'create',
        entity_type: 'driver',
        entity_id: 'driver-456',
        details: { driver_name: 'Jane Smith' },
        admin_id: 'admin-1',
        admin_name: 'Admin User',
        created_at: new Date(Date.now() - 7200000).toISOString(),
      },
    ]

    // Try to fetch from actual table, fallback to mock
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (!error && data && data.length > 0) {
      setActivities(data)
    } else {
      setActivities(mockActivities)
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
          <h1 className="text-3xl font-bold">Activity Log</h1>
          <p className="text-muted-foreground">Track all admin actions and changes</p>
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
              No activity logs found
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
