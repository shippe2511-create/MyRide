"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Smartphone, FileText, Phone, HelpCircle, Shield, Settings2, Plus, Pencil,
  Trash2, Mail, MessageSquare, AlertTriangle, Save, Loader2, Globe, Building2
} from "lucide-react"
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
}

interface LegalPage {
  id: string
  slug: string
  title: string
  content: string
  page_type: string
  target_app: string
  is_active: boolean
  updated_at: string
}

interface HelpContent {
  id: string
  app_type: string
  content_type: string
  title: string
  subtitle: string | null
  value: string | null
  icon: string | null
  sort_order: number
  is_active: boolean
}

const ICONS = [
  { value: "phone", label: "Phone", icon: Phone },
  { value: "email", label: "Email", icon: Mail },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { value: "emergency", label: "Emergency", icon: AlertTriangle },
]

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
}

export default function AppConfigPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // General settings
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)

  // Legal pages
  const [pages, setPages] = useState<LegalPage[]>([])
  const [pageDialog, setPageDialog] = useState(false)
  const [editingPage, setEditingPage] = useState<LegalPage | null>(null)
  const [pageForm, setPageForm] = useState({ title: "", slug: "", content: "", page_type: "terms", target_app: "both", is_active: true })

  // Help content
  const [helpContent, setHelpContent] = useState<HelpContent[]>([])
  const [helpDialog, setHelpDialog] = useState(false)
  const [editingHelp, setEditingHelp] = useState<HelpContent | null>(null)
  const [helpForm, setHelpForm] = useState({ app_type: "customer", content_type: "faq", title: "", subtitle: "", value: "", icon: "phone", is_active: true })

  const [deleteId, setDeleteId] = useState<{ type: string; id: string } | null>(null)

  useEffect(() => {
    loadAll(true)

    // Realtime subscriptions - silent refresh without loading state
    const channel = supabase
      .channel('app_config_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => loadAll(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pages' }, () => loadAll(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_content' }, () => loadAll(false))
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadAll = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    const [settingsRes, pagesRes, helpRes] = await Promise.all([
      supabase.from("app_settings").select("*").eq("id", "default").single(),
      supabase.from("pages").select("*").order("display_order"),
      supabase.from("help_content").select("*").order("app_type").order("content_type").order("sort_order"),
    ])

    if (settingsRes.data) setSettings({ ...defaultSettings, ...settingsRes.data })
    setPages(pagesRes.data || [])
    setHelpContent(helpRes.data || [])
    if (showLoading) setLoading(false)
  }

  const saveSettings = async () => {
    setSaving(true)
    const { error } = await supabase.from("app_settings").upsert({
      ...settings,
      id: "default",
      updated_at: new Date().toISOString()
    })

    if (error) {
      toast.error("Failed to save settings")
    } else {
      toast.success("Settings saved")
      await logActivity({ action: "update", entityType: "settings", details: { message: "Updated app settings" } })
    }
    setSaving(false)
  }

  // Legal Pages handlers
  const openPageDialog = (page?: LegalPage) => {
    if (page) {
      setEditingPage(page)
      setPageForm({
        title: page.title,
        slug: page.slug,
        content: page.content,
        page_type: page.page_type,
        target_app: page.target_app,
        is_active: page.is_active
      })
    } else {
      setEditingPage(null)
      setPageForm({ title: "", slug: "", content: "", page_type: "terms", target_app: "both", is_active: true })
    }
    setPageDialog(true)
  }

  const savePage = async () => {
    if (!pageForm.title || !pageForm.slug) {
      toast.error("Title and slug are required")
      return
    }

    const payload = {
      ...pageForm,
      updated_at: new Date().toISOString()
    }

    if (editingPage) {
      const { error } = await supabase.from("pages").update(payload).eq("id", editingPage.id)
      if (error) toast.error("Failed to update")
      else {
        toast.success("Page updated")
        setPages(prev => prev.map(p => p.id === editingPage.id ? { ...p, ...payload } : p))
      }
    } else {
      const { data, error } = await supabase.from("pages").insert(payload).select().single()
      if (error) toast.error("Failed to create")
      else {
        toast.success("Page created")
        if (data) setPages(prev => [...prev, data])
      }
    }
    setPageDialog(false)
  }

  // Help Content handlers
  const openHelpDialog = (item?: HelpContent, contentType?: string, appType?: string) => {
    if (item) {
      setEditingHelp(item)
      setHelpForm({
        app_type: item.app_type,
        content_type: item.content_type,
        title: item.title,
        subtitle: item.subtitle || "",
        value: item.value || "",
        icon: item.icon || "phone",
        is_active: item.is_active
      })
    } else {
      setEditingHelp(null)
      setHelpForm({
        app_type: appType || "customer",
        content_type: contentType || "faq",
        title: "",
        subtitle: "",
        value: "",
        icon: "phone",
        is_active: true
      })
    }
    setHelpDialog(true)
  }

  const saveHelp = async () => {
    if (!helpForm.title) {
      toast.error("Title is required")
      return
    }

    const payload = {
      app_type: helpForm.app_type,
      content_type: helpForm.content_type,
      title: helpForm.title,
      subtitle: helpForm.subtitle || null,
      value: helpForm.value || null,
      icon: helpForm.icon || null,
      is_active: helpForm.is_active,
      sort_order: editingHelp?.sort_order || helpContent.filter(h => h.content_type === helpForm.content_type && h.app_type === helpForm.app_type).length + 1,
    }

    if (editingHelp) {
      const { error } = await supabase.from("help_content").update(payload).eq("id", editingHelp.id)
      if (error) toast.error("Failed to update")
      else {
        toast.success("Updated")
        setHelpContent(prev => prev.map(h => h.id === editingHelp.id ? { ...h, ...payload } : h))
      }
    } else {
      const { data, error } = await supabase.from("help_content").insert(payload).select().single()
      if (error) toast.error("Failed to create")
      else {
        toast.success("Created")
        if (data) setHelpContent(prev => [...prev, data])
      }
    }
    setHelpDialog(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const { type, id } = deleteId
    setDeleteId(null)

    const table = type === "page" ? "pages" : "help_content"
    const { error } = await supabase.from(table).delete().eq("id", id)

    if (error) {
      toast.error("Failed to delete")
    } else {
      toast.success("Deleted")
      if (type === "page") {
        setPages(prev => prev.filter(p => p.id !== id))
      } else {
        setHelpContent(prev => prev.filter(h => h.id !== id))
      }
    }
  }

  const toggleActive = async (type: string, id: string, currentValue: boolean) => {
    const table = type === "page" ? "pages" : "help_content"
    const { error } = await supabase.from(table).update({ is_active: !currentValue }).eq("id", id)

    if (!error) {
      if (type === "page") {
        setPages(prev => prev.map(p => p.id === id ? { ...p, is_active: !currentValue } : p))
      } else {
        setHelpContent(prev => prev.map(h => h.id === id ? { ...h, is_active: !currentValue } : h))
      }
    }
  }

  const getIcon = (iconName: string | null) => {
    const found = ICONS.find(i => i.value === iconName)
    return found ? <found.icon className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />
  }

  const customerFaqs = helpContent.filter(h => h.app_type === "customer" && h.content_type === "faq")
  const driverFaqs = helpContent.filter(h => h.app_type === "driver" && h.content_type === "faq")
  const customerContacts = helpContent.filter(h => h.app_type === "customer" && h.content_type === "contact")
  const driverContacts = helpContent.filter(h => h.app_type === "driver" && h.content_type === "contact")

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <PermissionGate permission="settings:view">
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Smartphone className="h-6 w-6" />
          App Configuration
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage app settings, legal pages, FAQs, and support contacts for both apps
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="legal" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Legal Pages
          </TabsTrigger>
          <TabsTrigger value="support" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Support Contacts
          </TabsTrigger>
          <TabsTrigger value="faqs" className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            FAQs
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Company & Support Info
              </CardTitle>
              <CardDescription>Basic company information shown in both apps</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Company Name</label>
                  <Input
                    value={settings.company_name}
                    onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Support Phone</label>
                  <Input
                    value={settings.support_phone}
                    onChange={(e) => setSettings({ ...settings, support_phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Support Email</label>
                <Input
                  value={settings.support_email}
                  onChange={(e) => setSettings({ ...settings, support_email: e.target.value })}
                />
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-4">Feature Toggles</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <span className="text-sm">SOS Feature</span>
                    <Switch
                      checked={settings.enable_sos}
                      onCheckedChange={(v) => setSettings({ ...settings, enable_sos: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <span className="text-sm">In-App Chat</span>
                    <Switch
                      checked={settings.enable_chat}
                      onCheckedChange={(v) => setSettings({ ...settings, enable_chat: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <span className="text-sm">Ratings</span>
                    <Switch
                      checked={settings.enable_ratings}
                      onCheckedChange={(v) => setSettings({ ...settings, enable_ratings: v })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-4">Approval Settings</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="text-sm font-medium">Require Driver Approval</p>
                      <p className="text-xs text-muted-foreground">New drivers need admin approval</p>
                    </div>
                    <Switch
                      checked={settings.require_driver_approval}
                      onCheckedChange={(v) => setSettings({ ...settings, require_driver_approval: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="text-sm font-medium">Require Customer Approval</p>
                      <p className="text-xs text-muted-foreground">New customers need admin approval</p>
                    </div>
                    <Switch
                      checked={settings.require_customer_approval}
                      onCheckedChange={(v) => setSettings({ ...settings, require_customer_approval: v })}
                    />
                  </div>
                </div>
              </div>

              <Button onClick={saveSettings} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Legal Pages */}
        <TabsContent value="legal">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Legal Pages</CardTitle>
                <CardDescription>Terms of Service, Privacy Policy, and other legal content</CardDescription>
              </div>
              <Button onClick={() => openPageDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Page
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Target App</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No legal pages yet. Add Terms of Service and Privacy Policy.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pages.map((page) => (
                      <TableRow key={page.id} className="group hover:bg-muted/50 transition-colors">
                        <TableCell className="font-medium">{page.title}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-sm">{page.slug}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{page.page_type}</Badge></TableCell>
                        <TableCell><Badge variant="secondary" className="capitalize">{page.target_app}</Badge></TableCell>
                        <TableCell>
                          <Switch
                            checked={page.is_active}
                            onCheckedChange={() => toggleActive("page", page.id, page.is_active)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" onClick={() => openPageDialog(page)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteId({ type: "page", id: page.id })}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Support Contacts */}
        <TabsContent value="support">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Customer App Contacts */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">Customer App</CardTitle>
                  <CardDescription>Contact options in customer app</CardDescription>
                </div>
                <Button size="sm" onClick={() => openHelpDialog(undefined, "contact", "customer")}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </CardHeader>
              <CardContent>
                {customerContacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No contacts configured</p>
                ) : (
                  <div className="space-y-2">
                    {customerContacts.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          {getIcon(item.icon)}
                          <div>
                            <p className="font-medium text-sm">{item.title}</p>
                            <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={item.is_active}
                            onCheckedChange={() => toggleActive("help", item.id, item.is_active)}
                          />
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openHelpDialog(item)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Driver App Contacts */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">Driver App</CardTitle>
                  <CardDescription>Contact options in driver app</CardDescription>
                </div>
                <Button size="sm" onClick={() => openHelpDialog(undefined, "contact", "driver")}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </CardHeader>
              <CardContent>
                {driverContacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No contacts configured</p>
                ) : (
                  <div className="space-y-2">
                    {driverContacts.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          {getIcon(item.icon)}
                          <div>
                            <p className="font-medium text-sm">{item.title}</p>
                            <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={item.is_active}
                            onCheckedChange={() => toggleActive("help", item.id, item.is_active)}
                          />
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openHelpDialog(item)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* FAQs */}
        <TabsContent value="faqs">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Customer FAQs */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">Customer App FAQs</CardTitle>
                  <CardDescription>Frequently asked questions for customers</CardDescription>
                </div>
                <Button size="sm" onClick={() => openHelpDialog(undefined, "faq", "customer")}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </CardHeader>
              <CardContent>
                {customerFaqs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No FAQs added</p>
                ) : (
                  <div className="space-y-2">
                    {customerFaqs.map((item) => (
                      <div key={item.id} className="p-3 rounded-lg border">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{item.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.subtitle}</p>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <Switch
                              checked={item.is_active}
                              onCheckedChange={() => toggleActive("help", item.id, item.is_active)}
                            />
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openHelpDialog(item)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDeleteId({ type: "help", id: item.id })}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Driver FAQs */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">Driver App FAQs</CardTitle>
                  <CardDescription>Frequently asked questions for drivers</CardDescription>
                </div>
                <Button size="sm" onClick={() => openHelpDialog(undefined, "faq", "driver")}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </CardHeader>
              <CardContent>
                {driverFaqs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No FAQs added</p>
                ) : (
                  <div className="space-y-2">
                    {driverFaqs.map((item) => (
                      <div key={item.id} className="p-3 rounded-lg border">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{item.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.subtitle}</p>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <Switch
                              checked={item.is_active}
                              onCheckedChange={() => toggleActive("help", item.id, item.is_active)}
                            />
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openHelpDialog(item)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDeleteId({ type: "help", id: item.id })}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Legal Page Dialog */}
      <Dialog open={pageDialog} onOpenChange={setPageDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingPage ? "Edit Legal Page" : "Add Legal Page"}</DialogTitle>
            <DialogDescription>Manage terms, privacy policy, and other legal content</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={pageForm.title}
                  onChange={(e) => setPageForm({ ...pageForm, title: e.target.value })}
                  placeholder="Terms of Service"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Slug</label>
                <Input
                  value={pageForm.slug}
                  onChange={(e) => setPageForm({ ...pageForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                  placeholder="terms-of-service"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Page Type</label>
                <Select value={pageForm.page_type} onValueChange={(v) => setPageForm({ ...pageForm, page_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="terms">Terms of Service</SelectItem>
                    <SelectItem value="privacy">Privacy Policy</SelectItem>
                    <SelectItem value="page">General Page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Target App</label>
                <Select value={pageForm.target_app} onValueChange={(v) => setPageForm({ ...pageForm, target_app: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Both Apps</SelectItem>
                    <SelectItem value="customer">Customer Only</SelectItem>
                    <SelectItem value="driver">Driver Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Content</label>
              <Textarea
                value={pageForm.content}
                onChange={(e) => setPageForm({ ...pageForm, content: e.target.value })}
                placeholder="Enter page content..."
                rows={12}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={pageForm.is_active}
                onCheckedChange={(v) => setPageForm({ ...pageForm, is_active: v })}
              />
              <span className="text-sm">Active (visible in apps)</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPageDialog(false)}>Cancel</Button>
            <Button onClick={savePage}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Help Content Dialog */}
      <Dialog open={helpDialog} onOpenChange={setHelpDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingHelp ? "Edit" : "Add"} {helpForm.content_type === "faq" ? "FAQ" : "Contact"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {helpForm.content_type === "contact" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Icon</label>
                <Select value={helpForm.icon} onValueChange={(v) => setHelpForm({ ...helpForm, icon: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ICONS.map(icon => (
                      <SelectItem key={icon.value} value={icon.value}>
                        <div className="flex items-center gap-2">
                          <icon.icon className="h-4 w-4" />
                          {icon.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">{helpForm.content_type === "faq" ? "Question" : "Title"}</label>
              <Input
                value={helpForm.title}
                onChange={(e) => setHelpForm({ ...helpForm, title: e.target.value })}
                placeholder={helpForm.content_type === "faq" ? "How do I book a ride?" : "Call Support"}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{helpForm.content_type === "faq" ? "Answer" : "Display Text"}</label>
              {helpForm.content_type === "faq" ? (
                <Textarea
                  value={helpForm.subtitle}
                  onChange={(e) => setHelpForm({ ...helpForm, subtitle: e.target.value })}
                  placeholder="Enter the answer..."
                  rows={4}
                />
              ) : (
                <Input
                  value={helpForm.subtitle}
                  onChange={(e) => setHelpForm({ ...helpForm, subtitle: e.target.value })}
                  placeholder="+960 333-3333"
                />
              )}
            </div>
            {helpForm.content_type === "contact" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Action Value</label>
                <Input
                  value={helpForm.value}
                  onChange={(e) => setHelpForm({ ...helpForm, value: e.target.value })}
                  placeholder="tel:+9603333333 or mailto:support@myride.mv"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHelpDialog(false)}>Cancel</Button>
            <Button onClick={saveHelp}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </PermissionGate>
  )
}
