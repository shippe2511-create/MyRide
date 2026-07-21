"use client"

import { useState, useEffect, useRef } from "react"
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
import { TimePicker } from "@/components/ui/time-picker"
import { Settings, Globe, Bell, Shield, Database, Save, Loader2, KeyRound, Plus, Trash2, Eye, EyeOff, Clock } from "lucide-react"
import { toast } from "sonner"
import { logActivity } from "@/lib/activity-logger"
import { PermissionGate } from "@/components/permission-gate"

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
  schedule_enabled: boolean
  schedule_min_hours_ahead: number
  schedule_max_days_ahead: number
  schedule_allowed_start_time: string
  schedule_allowed_end_time: string
  notif_ride_request: boolean
  notif_ride_accepted: boolean
  notif_driver_arrived: boolean
  notif_ride_completed: boolean
  notif_promotions: boolean
  break_reminder_minutes: number
}

interface EmergencyContact {
  id: string
  name: string
  phone: string
  icon: string
  sort_order: number
  is_active: boolean
}

interface DocumentType {
  id: string
  name: string
  label: string
  icon: string
  is_required: boolean
  is_active: boolean
  sort_order: number
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
  schedule_enabled: true,
  schedule_min_hours_ahead: 1,
  schedule_max_days_ahead: 7,
  schedule_allowed_start_time: "06:00",
  schedule_allowed_end_time: "22:00",
  notif_ride_request: true,
  notif_ride_accepted: true,
  notif_driver_arrived: true,
  notif_ride_completed: true,
  notif_promotions: true,
  break_reminder_minutes: 30,
}

export default function SettingsPage() {
  const supabase = createClient()
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([])
  const [savingContacts, setSavingContacts] = useState(false)
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([])
  const [savingDocTypes, setSavingDocTypes] = useState(false)
  const [mounted, setMounted] = useState(false)

  const isSavingRef = useRef(false)

  useEffect(() => {
    setMounted(true)
    loadSettings(true)
    loadEmergencyContacts()
    loadDocumentTypes()

    // Realtime subscription - skip if we're currently saving
    const channel = supabase
      .channel('settings_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => {
        if (!isSavingRef.current) loadSettings(false)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_contacts' }, () => {
        if (!isSavingRef.current) loadEmergencyContacts()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'document_types' }, () => {
        if (!isSavingRef.current) loadDocumentTypes()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadSettings = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("*")
        .limit(1)
        .single()

      if (data) {
        // Convert time fields from HH:mm:ss to HH:mm format
        const processedData = {
          ...data,
          schedule_allowed_start_time: data.schedule_allowed_start_time?.substring(0, 5) || "06:00",
          schedule_allowed_end_time: data.schedule_allowed_end_time?.substring(0, 5) || "22:00",
        }
        setSettings({ ...defaultSettings, ...processedData })
      }
    } catch {
      // Use defaults if no settings exist
    }
    if (showLoading) setLoading(false)
  }

  const saveSettings = async () => {
    setSaving(true)
    isSavingRef.current = true
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
          schedule_enabled: settings.schedule_enabled,
          schedule_min_hours_ahead: settings.schedule_min_hours_ahead,
          schedule_max_days_ahead: settings.schedule_max_days_ahead,
          schedule_allowed_start_time: settings.schedule_allowed_start_time,
          schedule_allowed_end_time: settings.schedule_allowed_end_time,
          notif_ride_request: settings.notif_ride_request,
          notif_ride_accepted: settings.notif_ride_accepted,
          notif_driver_arrived: settings.notif_driver_arrived,
          notif_ride_completed: settings.notif_ride_completed,
          notif_promotions: settings.notif_promotions,
          break_reminder_minutes: settings.break_reminder_minutes,
          updated_at: new Date().toISOString()
        })

      if (error) throw error
      toast.success("Settings saved successfully")
      logActivity({ action: 'update', entityType: 'settings', entityId: 'app-settings', details: { company_name: settings.company_name } })
    } catch {
      toast.error("Failed to save settings")
    }
    setSaving(false)
    setTimeout(() => { isSavingRef.current = false }, 500)
  }

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const loadEmergencyContacts = async () => {
    const { data } = await supabase
      .from("emergency_contacts")
      .select("*")
      .order("sort_order", { ascending: true })
    if (data) setEmergencyContacts(data)
  }

  const saveEmergencyContacts = async () => {
    setSavingContacts(true)
    isSavingRef.current = true
    try {
      for (const contact of emergencyContacts) {
        const { error } = await supabase.from("emergency_contacts").upsert({
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          icon: contact.icon,
          sort_order: contact.sort_order,
          is_active: contact.is_active,
          updated_at: new Date().toISOString()
        })
        if (error) throw error
      }
      toast.success("Emergency contacts saved")
      logActivity({ action: 'update', entityType: 'settings', entityId: 'emergency-contacts', details: { count: emergencyContacts.length } })
    } catch {
      toast.error("Failed to save contacts")
    }
    setSavingContacts(false)
    setTimeout(() => { isSavingRef.current = false }, 500)
  }

  const addEmergencyContact = () => {
    const newContact: EmergencyContact = {
      id: crypto.randomUUID(),
      name: "",
      phone: "",
      icon: "phone",
      sort_order: emergencyContacts.length + 1,
      is_active: true
    }
    setEmergencyContacts([...emergencyContacts, newContact])
  }

  const updateContact = (id: string, field: keyof EmergencyContact, value: string | number | boolean) => {
    setEmergencyContacts(contacts =>
      contacts.map(c => c.id === id ? { ...c, [field]: value } : c)
    )
  }

  const deleteContact = async (id: string) => {
    await supabase.from("emergency_contacts").delete().eq("id", id)
    setEmergencyContacts(contacts => contacts.filter(c => c.id !== id))
    toast.success("Contact deleted")
  }

  // Document Types functions
  const loadDocumentTypes = async () => {
    const { data } = await supabase
      .from("document_types")
      .select("*")
      .order("sort_order")
    if (data) setDocumentTypes(data)
  }

  const saveDocumentTypes = async () => {
    setSavingDocTypes(true)
    isSavingRef.current = true
    try {
      for (const dt of documentTypes) {
        const { error } = await supabase.from("document_types").upsert({
          id: dt.id,
          name: dt.name,
          label: dt.label,
          icon: dt.icon,
          is_required: dt.is_required,
          is_active: dt.is_active,
          sort_order: dt.sort_order,
        })
        if (error) throw error
      }
      toast.success("Document types saved")
      logActivity({ action: 'update', entityType: 'settings', entityId: 'document-types', details: { count: documentTypes.length } })
    } catch {
      toast.error("Failed to save document types")
    }
    setSavingDocTypes(false)
    setTimeout(() => { isSavingRef.current = false }, 500)
  }

  const addDocumentType = () => {
    const newType: DocumentType = {
      id: crypto.randomUUID(),
      name: "",
      label: "",
      icon: "description",
      is_required: true,
      is_active: true,
      sort_order: documentTypes.length
    }
    setDocumentTypes([...documentTypes, newType])
  }

  const updateDocType = (id: string, field: keyof DocumentType, value: string | number | boolean) => {
    setDocumentTypes(types =>
      types.map(t => t.id === id ? { ...t, [field]: value } : t)
    )
  }

  const deleteDocType = async (id: string) => {
    await supabase.from("document_types").delete().eq("id", id)
    setDocumentTypes(types => types.filter(t => t.id !== id))
    toast.success("Document type deleted")
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

  if (!mounted) {
    return (
      <PermissionGate permission="settings:view">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PermissionGate>
    )
  }

  return (
    <PermissionGate permission="settings:view">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure application settings and preferences
          </p>
        </div>
        {!loading && <Button onClick={saveSettings} disabled={saving}>
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
        </Button>}
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="rides">Rides</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">Break Reminder (minutes)</label>
                  <Input
                    type="number"
                    value={settings.break_reminder_minutes}
                    onChange={(e) => updateSetting("break_reminder_minutes", Number(e.target.value))}
                    min={5}
                    max={120}
                  />
                  <p className="text-xs text-muted-foreground">Notify drivers after this many minutes on break to go back online</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Scheduled Rides
              </CardTitle>
              <CardDescription>Configure scheduling restrictions for customers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Enable Scheduled Rides</label>
                  <Select
                    value={settings.schedule_enabled ? "enabled" : "disabled"}
                    onValueChange={(v) => updateSetting("schedule_enabled", v === "enabled")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enabled">Enabled</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Allow customers to schedule rides in advance</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Minimum Hours Ahead</label>
                  <Input
                    type="number"
                    value={settings.schedule_min_hours_ahead}
                    onChange={(e) => updateSetting("schedule_min_hours_ahead", Number(e.target.value))}
                    min={0}
                    max={48}
                  />
                  <p className="text-xs text-muted-foreground">Minimum hours before scheduled time (0 = no minimum)</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Maximum Days Ahead</label>
                  <Input
                    type="number"
                    value={settings.schedule_max_days_ahead}
                    onChange={(e) => updateSetting("schedule_max_days_ahead", Number(e.target.value))}
                    min={1}
                    max={30}
                  />
                  <p className="text-xs text-muted-foreground">Maximum days in advance for scheduling</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Allowed Time Range</label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <TimePicker
                        value={settings.schedule_allowed_start_time}
                        onChange={(v) => updateSetting("schedule_allowed_start_time", v)}
                      />
                    </div>
                    <span className="text-muted-foreground font-medium">to</span>
                    <div className="flex-1">
                      <TimePicker
                        value={settings.schedule_allowed_end_time}
                        onChange={(v) => updateSetting("schedule_allowed_end_time", v)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Allowed time window for scheduled pickups</p>
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
                <span className="block mt-1 text-muted-foreground">
                  Push notifications require Firebase setup in both apps.
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

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Required Documents
              </CardTitle>
              <CardDescription>Configure document types that drivers must upload</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_120px_80px_80px_40px] gap-2 px-2 py-1 text-sm font-medium text-muted-foreground">
                  <span>Document Name</span>
                  <span>Icon</span>
                  <span className="text-center">Required</span>
                  <span className="text-center">Active</span>
                  <span></span>
                </div>
                {documentTypes.map((dt) => (
                  <div key={dt.id} className="grid grid-cols-[1fr_120px_80px_80px_40px] gap-2 items-center p-2 rounded-lg border bg-card">
                    <Input
                      value={dt.label}
                      onChange={(e) => {
                        const label = e.target.value
                        const name = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
                        updateDocType(dt.id, "label", label)
                        updateDocType(dt.id, "name", name)
                      }}
                      placeholder="Driving License"
                      className="h-9"
                    />
                    <Select value={dt.icon} onValueChange={(v) => updateDocType(dt.id, "icon", v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="badge">Badge</SelectItem>
                        <SelectItem value="directions_car">Car</SelectItem>
                        <SelectItem value="security">Security</SelectItem>
                        <SelectItem value="credit_card">Card</SelectItem>
                        <SelectItem value="person">Person</SelectItem>
                        <SelectItem value="verified_user">Verified</SelectItem>
                        <SelectItem value="description">Document</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex justify-center">
                      <Switch
                        checked={dt.is_required}
                        onCheckedChange={(checked) => updateDocType(dt.id, "is_required", checked)}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Switch
                        checked={dt.is_active}
                        onCheckedChange={(checked) => updateDocType(dt.id, "is_active", checked)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteDocType(dt.id)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={addDocumentType}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Document Type
                </Button>
                <Button onClick={saveDocumentTypes} disabled={savingDocTypes}>
                  {savingDocTypes ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
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
                  <div className="relative">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Confirm Password</label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
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
    </PermissionGate>
  )
}
