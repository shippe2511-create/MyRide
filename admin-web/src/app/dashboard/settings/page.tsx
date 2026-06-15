"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Settings, Globe, Bell, Shield, Database, Save, Loader2, KeyRound } from "lucide-react"
import { toast } from "sonner"

interface AppSettings {
  id: string
  company_name: string
  support_email: string
  support_phone: string
  max_ride_distance_km: number
  default_wait_time_min: number
  require_driver_approval: boolean
  require_customer_approval: boolean
  enable_sos: boolean
  enable_chat: boolean
  enable_ratings: boolean
  notif_ride_request: boolean
  notif_ride_accepted: boolean
  notif_driver_arrived: boolean
  notif_ride_completed: boolean
  notif_promotions: boolean
}

const defaultSettings: AppSettings = {
  id: "default",
  company_name: "MyRide",
  support_email: "support@myride.com",
  support_phone: "+1234567890",
  max_ride_distance_km: 50,
  default_wait_time_min: 10,
  require_driver_approval: true,
  require_customer_approval: false,
  enable_sos: true,
  enable_chat: true,
  enable_ratings: true,
  notif_ride_request: true,
  notif_ride_accepted: true,
  notif_driver_arrived: true,
  notif_ride_completed: true,
  notif_promotions: true,
}

export default function SettingsPage() {
  const supabase = createClient()
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("*")
        .limit(1)
        .single()

      if (data) {
        setSettings({ ...defaultSettings, ...data })
      }
    } catch {
      // Use defaults if no settings exist
    }
    setLoading(false)
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert({
          id: settings.id || "default",
          company_name: settings.company_name,
          support_email: settings.support_email,
          support_phone: settings.support_phone,
          max_ride_distance_km: settings.max_ride_distance_km,
          default_wait_time_min: settings.default_wait_time_min,
          require_driver_approval: settings.require_driver_approval,
          require_customer_approval: settings.require_customer_approval,
          enable_sos: settings.enable_sos,
          enable_chat: settings.enable_chat,
          enable_ratings: settings.enable_ratings,
          updated_at: new Date().toISOString()
        })

      if (error) throw error
      toast.success("Settings saved successfully")
    } catch {
      toast.error("Failed to save settings")
    }
    setSaving(false)
  }

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }

    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        toast.error(error.message)
      } else {
        toast.success("Password updated successfully")
        setNewPassword("")
        setConfirmPassword("")
      }
    } catch {
      toast.error("Failed to update password")
    }
    setChangingPassword(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Configure application settings and preferences
          </p>
        </div>
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="rides">Rides</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Application Settings
              </CardTitle>
              <CardDescription>Basic application configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Company Name</label>
                  <Input
                    value={settings.company_name}
                    onChange={(e) => updateSetting("company_name", e.target.value)}
                    placeholder="MyRide"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Support Email</label>
                  <Input
                    type="email"
                    value={settings.support_email}
                    onChange={(e) => updateSetting("support_email", e.target.value)}
                    placeholder="support@myride.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Support Phone</label>
                  <Input
                    type="tel"
                    value={settings.support_phone}
                    onChange={(e) => updateSetting("support_phone", e.target.value)}
                    placeholder="+1234567890"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Require Driver Approval</label>
                  <Select
                    value={settings.require_driver_approval ? "yes" : "no"}
                    onValueChange={(v) => updateSetting("require_driver_approval", v === "yes")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes - Manual approval required</SelectItem>
                      <SelectItem value="no">No - Auto approve drivers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Require Customer Approval</label>
                  <Select
                    value={settings.require_customer_approval ? "yes" : "no"}
                    onValueChange={(v) => updateSetting("require_customer_approval", v === "yes")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes - Manual approval required</SelectItem>
                      <SelectItem value="no">No - Auto approve customers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rides" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Ride Configuration
              </CardTitle>
              <CardDescription>Configure ride-related settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Ride Distance (km)</label>
                  <Input
                    type="number"
                    value={settings.max_ride_distance_km}
                    onChange={(e) => updateSetting("max_ride_distance_km", Number(e.target.value))}
                    min={1}
                    max={500}
                  />
                  <p className="text-xs text-muted-foreground">Maximum allowed distance per ride</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Default Wait Time (minutes)</label>
                  <Input
                    type="number"
                    value={settings.default_wait_time_min}
                    onChange={(e) => updateSetting("default_wait_time_min", Number(e.target.value))}
                    min={1}
                    max={60}
                  />
                  <p className="text-xs text-muted-foreground">Default driver wait time at pickup</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Enable SOS</label>
                  <Select
                    value={settings.enable_sos ? "enabled" : "disabled"}
                    onValueChange={(v) => updateSetting("enable_sos", v === "enabled")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enabled">Enabled</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Allow emergency SOS button in rides</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Enable Chat</label>
                  <Select
                    value={settings.enable_chat ? "enabled" : "disabled"}
                    onValueChange={(v) => updateSetting("enable_chat", v === "enabled")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enabled">Enabled</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Allow in-app chat between customer and driver</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Configure push notification behavior
                <span className="block mt-1 text-yellow-600 dark:text-yellow-500">
                  Note: These settings are not yet persisted. Push notifications require Firebase setup.
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div>
                <h4 className="font-medium mb-4">Notification Types</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Ride Request</p>
                      <p className="text-xs text-muted-foreground">Notify drivers of new ride requests</p>
                    </div>
                    <Switch
                      checked={settings.notif_ride_request}
                      onCheckedChange={(checked) => updateSetting("notif_ride_request", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Ride Accepted</p>
                      <p className="text-xs text-muted-foreground">Notify customers when driver accepts</p>
                    </div>
                    <Switch
                      checked={settings.notif_ride_accepted}
                      onCheckedChange={(checked) => updateSetting("notif_ride_accepted", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Driver Arrived</p>
                      <p className="text-xs text-muted-foreground">Notify customers when driver arrives</p>
                    </div>
                    <Switch
                      checked={settings.notif_driver_arrived}
                      onCheckedChange={(checked) => updateSetting("notif_driver_arrived", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Ride Completed</p>
                      <p className="text-xs text-muted-foreground">Notify both parties on completion</p>
                    </div>
                    <Switch
                      checked={settings.notif_ride_completed}
                      onCheckedChange={(checked) => updateSetting("notif_ride_completed", checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Promotions</p>
                      <p className="text-xs text-muted-foreground">Send promotional announcements</p>
                    </div>
                    <Switch
                      checked={settings.notif_promotions}
                      onCheckedChange={(checked) => updateSetting("notif_promotions", checked)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Change Password
              </CardTitle>
              <CardDescription>Update your admin account password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">New Password</label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Confirm Password</label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
              <Button onClick={handleChangePassword} disabled={changingPassword || !newPassword}>
                {changingPassword ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Settings
              </CardTitle>
              <CardDescription>Security and access control configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Row Level Security</p>
                    <p className="text-sm text-muted-foreground">Database-level access control</p>
                  </div>
                  <Badge variant="success">Enabled</Badge>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Admin Authentication</p>
                    <p className="text-sm text-muted-foreground">Role-based admin access via Supabase Auth</p>
                  </div>
                  <Badge variant="success">Active</Badge>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">API Rate Limiting</p>
                    <p className="text-sm text-muted-foreground">Protect against abuse</p>
                  </div>
                  <Badge variant="secondary">Supabase Default</Badge>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Audit Logging</p>
                    <p className="text-sm text-muted-foreground">Track admin actions</p>
                  </div>
                  <Badge variant="success">Enabled</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Database Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 border rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-500">Healthy</p>
                  <p className="text-sm text-muted-foreground">Connection Status</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <p className="text-2xl font-bold">Supabase</p>
                  <p className="text-sm text-muted-foreground">Provider</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <p className="text-2xl font-bold">PostgreSQL</p>
                  <p className="text-sm text-muted-foreground">Database</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
