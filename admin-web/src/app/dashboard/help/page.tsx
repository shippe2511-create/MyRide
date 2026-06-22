"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Switch } from "@/components/ui/switch"
import { PermissionGate } from "@/components/permission-gate"
import {
  Plus,
  Pencil,
  Trash2,
  Phone,
  Mail,
  MessageSquare,
  HelpCircle,
  AlertTriangle,
  GripVertical,
} from "lucide-react"

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

export default function HelpContentPage() {
  const supabase = createClient()
  const [content, setContent] = useState<HelpContent[]>([])
  const [loading, setLoading] = useState(true)
  const [appType, setAppType] = useState("driver")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<HelpContent | null>(null)
  const [formData, setFormData] = useState({
    content_type: "contact",
    title: "",
    subtitle: "",
    value: "",
    icon: "phone",
    is_active: true,
  })

  useEffect(() => {
    loadContent()

    // Realtime subscription
    const channel = supabase
      .channel('help_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_content' }, () => {
        loadContent()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [appType])

  const loadContent = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("help_content")
      .select("*")
      .eq("app_type", appType)
      .order("content_type")
      .order("sort_order")

    if (error) {
      toast.error("Failed to load content")
    } else {
      setContent(data || [])
    }
    setLoading(false)
  }

  const openAddDialog = (contentType: string) => {
    setEditingItem(null)
    setFormData({
      content_type: contentType,
      title: "",
      subtitle: "",
      value: "",
      icon: contentType === "contact" ? "phone" : "",
      is_active: true,
    })
    setDialogOpen(true)
  }

  const openEditDialog = (item: HelpContent) => {
    setEditingItem(item)
    setFormData({
      content_type: item.content_type,
      title: item.title,
      subtitle: item.subtitle || "",
      value: item.value || "",
      icon: item.icon || "",
      is_active: item.is_active,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error("Title is required")
      return
    }

    const payload = {
      app_type: appType,
      content_type: formData.content_type,
      title: formData.title,
      subtitle: formData.subtitle || null,
      value: formData.value || null,
      icon: formData.icon || null,
      is_active: formData.is_active,
      sort_order: editingItem?.sort_order || content.filter(c => c.content_type === formData.content_type).length + 1,
    }

    setDialogOpen(false)

    if (editingItem) {
      const { error } = await supabase
        .from("help_content")
        .update(payload)
        .eq("id", editingItem.id)

      if (error) {
        toast.error("Failed to update")
      } else {
        toast.success("Updated successfully")
        setContent(prev => prev.map(c => c.id === editingItem.id ? { ...c, ...payload } : c))
      }
    } else {
      const { data, error } = await supabase
        .from("help_content")
        .insert(payload)
        .select()
        .single()

      if (error) {
        toast.error("Failed to create")
      } else {
        toast.success("Created successfully")
        if (data) setContent(prev => [...prev, data])
      }
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const idToDelete = deleteId
    setDeleteId(null)

    const { error } = await supabase.from("help_content").delete().eq("id", idToDelete)
    if (error) {
      toast.error("Failed to delete")
    } else {
      toast.success("Deleted successfully")
      setContent(prev => prev.filter(c => c.id !== idToDelete))
    }
  }

  const toggleActive = async (item: HelpContent) => {
    const { error } = await supabase
      .from("help_content")
      .update({ is_active: !item.is_active })
      .eq("id", item.id)

    if (error) {
      toast.error("Failed to update")
    } else {
      setContent(prev => prev.map(c => c.id === item.id ? { ...c, is_active: !c.is_active } : c))
    }
  }

  const contacts = content.filter(c => c.content_type === "contact")
  const faqs = content.filter(c => c.content_type === "faq")
  const emergency = content.filter(c => c.content_type === "emergency")

  const getIcon = (iconName: string | null) => {
    const found = ICONS.find(i => i.value === iconName)
    return found ? <found.icon className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />
  }

  return (
    <PermissionGate permission="settings:view">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Help Center Content</h1>
          <p className="text-muted-foreground">Manage FAQs, contact info, and support content</p>
        </div>
      </div>

      <Tabs value={appType} onValueChange={setAppType}>
        <TabsList>
          <TabsTrigger value="driver">Driver App</TabsTrigger>
          <TabsTrigger value="customer">Customer App</TabsTrigger>
        </TabsList>

        <TabsContent value={appType} className="space-y-6">
          {/* Contact Support */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Contact Support</h3>
              <Button size="sm" onClick={() => openAddDialog("contact")}>
                <Plus className="h-4 w-4 mr-2" />
                Add Contact
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Icon</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Display Text</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                      No contacts added
                    </TableCell>
                  </TableRow>
                ) : (
                  contacts.map(item => (
                    <TableRow key={item.id} className="group hover:bg-muted/50 transition-colors">
                      <TableCell>{getIcon(item.icon)}</TableCell>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell>{item.subtitle}</TableCell>
                      <TableCell className="text-muted-foreground">{item.value}</TableCell>
                      <TableCell>
                        <Switch checked={item.is_active} onCheckedChange={() => toggleActive(item)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="ghost" onClick={() => openEditDialog(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteId(item.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* FAQs */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Frequently Asked Questions</h3>
              <Button size="sm" onClick={() => openAddDialog("faq")}>
                <Plus className="h-4 w-4 mr-2" />
                Add FAQ
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Answer</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {faqs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                      No FAQs added
                    </TableCell>
                  </TableRow>
                ) : (
                  faqs.map(item => (
                    <TableRow key={item.id} className="group hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium max-w-xs">{item.title}</TableCell>
                      <TableCell className="text-muted-foreground max-w-md truncate">{item.subtitle}</TableCell>
                      <TableCell>
                        <Switch checked={item.is_active} onCheckedChange={() => toggleActive(item)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="ghost" onClick={() => openEditDialog(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteId(item.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Emergency */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Emergency Contact</h3>
              {emergency.length === 0 && (
                <Button size="sm" onClick={() => openAddDialog("emergency")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Emergency
                </Button>
              )}
            </div>
            {emergency.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{item.value}</Badge>
                  <Button size="icon" variant="ghost" onClick={() => openEditDialog(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setDialogOpen(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit" : "Add"} {formData.content_type === "faq" ? "FAQ" : formData.content_type === "contact" ? "Contact" : "Emergency"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {formData.content_type === "contact" && (
              <div>
                <label className="text-sm font-medium">Icon</label>
                <Select value={formData.icon} onValueChange={(v) => setFormData({ ...formData, icon: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
            <div>
              <label className="text-sm font-medium">{formData.content_type === "faq" ? "Question" : "Title"}</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={formData.content_type === "faq" ? "Enter question" : "Enter title"}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{formData.content_type === "faq" ? "Answer" : "Display Text"}</label>
              {formData.content_type === "faq" ? (
                <Textarea
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  placeholder="Enter answer"
                  rows={4}
                />
              ) : (
                <Input
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  placeholder="e.g., +960 3001234"
                />
              )}
            </div>
            {formData.content_type !== "faq" && (
              <div>
                <label className="text-sm font-medium">Value (for action)</label>
                <Input
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  placeholder="e.g., +9603001234 or support@myride.mv"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingItem ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </PermissionGate>
  )
}
