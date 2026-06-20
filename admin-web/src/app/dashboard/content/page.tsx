"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { ImagePicker } from "@/components/ui/image-picker"
import { ComboboxInput } from "@/components/ui/combobox-input"
import { Plus, Edit, Trash2, MoreHorizontal, Loader2, Bell, Pin, Users, FileText, Megaphone, Calendar, Download } from "lucide-react"
import { SkeletonTable } from "@/components/ui/skeleton-card"

const STAFF_CATEGORIES = [
  { value: "news", label: "News" },
  { value: "policy", label: "Policy" },
  { value: "circular", label: "Circular" },
  { value: "notice", label: "Notice" },
  { value: "event", label: "Event" },
  { value: "memo", label: "Memo" },
  { value: "recognition", label: "Recognition" },
  { value: "training", label: "Training" },
  { value: "safety", label: "Safety" },
  { value: "hr", label: "HR" },
]

const ANNOUNCEMENT_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "transport", label: "Transport" },
  { value: "schedule", label: "Schedule Update" },
  { value: "maintenance", label: "Maintenance" },
  { value: "promotion", label: "Promotion" },
  { value: "service", label: "Service" },
  { value: "alert", label: "Alert" },
  { value: "holiday", label: "Holiday" },
]

import { formatDate } from "@/lib/utils"
import { toast } from "sonner"

interface StaffCornerItem {
  id: string
  title: string
  subtitle: string | null
  content: string | null
  image_url: string | null
  category: string
  category_color: string | null
  priority: string
  is_pinned: boolean
  is_active: boolean
  published_at: string | null
  expires_at: string | null
  created_at: string
}

export default function ContentPage() {
  const supabase = createClient()
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [notifications, setNotifications] = useState<any[]>([])
  const [staffCorner, setStaffCorner] = useState<StaffCornerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogType, setDialogType] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<any>({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [announcementsRes, notificationsRes, staffCornerRes] = await Promise.all([
      supabase.from("announcements").select("*").order("created_at", { ascending: false }),
      supabase.from("push_notification_logs").select("*").order("sent_at", { ascending: false }).limit(20),
      supabase.from("staff_corner").select("*").order("is_pinned", { ascending: false }).order("created_at", { ascending: false }),
    ])
    setAnnouncements(announcementsRes.data || [])
    setNotifications(notificationsRes.data || [])
    setStaffCorner(staffCornerRes.data || [])
    setLoading(false)
  }

  const openDialog = (type: string, item?: any) => {
    setSelectedItem(item || null)
    if (type === "announcement") {
      setFormData({
        title: item?.title || "",
        subtitle: item?.message || "",
        category: item?.category || "general",
        priority: item?.priority || "normal",
        is_pinned: item?.is_pinned || false,
        is_active: item?.is_active ?? true,
        image_url: item?.image_url || ""
      })
    } else if (type === "push") {
      setFormData({
        title: item?.title || "",
        body: item?.body || "",
        target_type: item?.target_type || "all"
      })
    } else if (type === "staff") {
      setFormData({
        title: item?.title || "",
        subtitle: item?.subtitle || "",
        content: item?.content || "",
        category: item?.category || "news",
        priority: item?.priority || "normal",
        is_pinned: item?.is_pinned || false,
        is_active: item?.is_active ?? true,
        image_url: item?.image_url || ""
      })
    }
    setDialogType(type)
  }

  const handleSave = async () => {
    setSaving(true)
    let error = null

    if (dialogType === "announcement") {
      if (!formData.title.trim()) {
        toast.error("Title is required")
        setSaving(false)
        return
      }
      const announcementPayload = {
        title: formData.title,
        message: formData.subtitle || null,
        category: formData.category || "general",
        priority: formData.priority,
        is_pinned: formData.is_pinned || false,
        is_active: formData.is_active,
        image_url: formData.image_url || null
      }
      if (selectedItem) {
        const res = await supabase.from("announcements").update(announcementPayload).eq("id", selectedItem.id)
        error = res.error
      } else {
        const res = await supabase.from("announcements").insert(announcementPayload)
        error = res.error
      }
    } else if (dialogType === "push") {
      if (!formData.title.trim() || !formData.body.trim()) {
        toast.error("Title and message are required")
        setSaving(false)
        return
      }
      if (selectedItem) {
        const res = await supabase.from("push_notification_logs").update({
          title: formData.title,
          body: formData.body,
          target_type: formData.target_type
        }).eq("id", selectedItem.id)
        error = res.error
        if (!error) toast.success("Push notification updated")
      } else {
        const res = await supabase.from("push_notification_logs").insert({
          title: formData.title,
          body: formData.body,
          target_type: formData.target_type,
          sent_at: new Date().toISOString(),
          sent_count: 0,
          success_count: 0
        })
        error = res.error
        if (!error) toast.success("Push notification logged (actual sending requires FCM setup)")
      }
    } else if (dialogType === "staff") {
      if (!formData.title.trim()) {
        toast.error("Title is required")
        setSaving(false)
        return
      }
      const payload = {
        title: formData.title,
        subtitle: formData.subtitle || null,
        content: formData.content || null,
        category: formData.category,
        priority: formData.priority,
        is_pinned: formData.is_pinned,
        is_active: formData.is_active,
        image_url: formData.image_url || null,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      if (selectedItem) {
        const res = await supabase.from("staff_corner").update(payload).eq("id", selectedItem.id)
        error = res.error
      } else {
        const res = await supabase.from("staff_corner").insert(payload)
        error = res.error
      }
    }

    if (error) {
      toast.error("Failed to save: " + error.message)
    } else {
      if (dialogType !== "push") toast.success("Saved successfully")
      // Update local state instead of full reload
      if (dialogType === "announcement") {
        if (selectedItem) {
          setAnnouncements(prev => prev.map(a => a.id === selectedItem.id ? { ...a, ...formData, message: formData.subtitle } : a))
        } else {
          // Reload only announcements for new items
          const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false })
          if (data) setAnnouncements(data)
        }
      } else if (dialogType === "staff") {
        if (selectedItem) {
          setStaffCorner(prev => prev.map(s => s.id === selectedItem.id ? { ...s, ...formData } as StaffCornerItem : s))
        } else {
          const { data } = await supabase.from("staff_corner").select("*").order("is_pinned", { ascending: false }).order("created_at", { ascending: false })
          if (data) setStaffCorner(data)
        }
      }
    }
    setSaving(false)
    setDialogType(null)
  }

  const handleDelete = async (type: string, id: string) => {
    const table = type === "staff" ? "staff_corner" : type === "push" ? "push_notification_logs" : "announcements"
    const { error } = await supabase.from(table).delete().eq("id", id)
    if (error) toast.error("Failed to delete")
    else {
      toast.success("Deleted")
      if (type === "staff") {
        setStaffCorner(prev => prev.filter(s => s.id !== id))
      } else if (type === "announcement") {
        setAnnouncements(prev => prev.filter(a => a.id !== id))
      }
    }
  }

  const togglePin = async (item: StaffCornerItem) => {
    const { error } = await supabase
      .from("staff_corner")
      .update({ is_pinned: !item.is_pinned })
      .eq("id", item.id)
    if (error) toast.error("Failed to update")
    else {
      toast.success(item.is_pinned ? "Unpinned" : "Pinned")
      setStaffCorner(prev => prev.map(s => s.id === item.id ? { ...s, is_pinned: !s.is_pinned } : s))
    }
  }

  const toggleAnnouncementPin = async (item: { id: string; is_pinned: boolean }) => {
    const { error } = await supabase
      .from("announcements")
      .update({ is_pinned: !item.is_pinned })
      .eq("id", item.id)
    if (error) toast.error("Failed to update")
    else {
      toast.success(item.is_pinned ? "Unpinned" : "Pinned")
      setAnnouncements(prev => prev.map(a => a.id === item.id ? { ...a, is_pinned: !a.is_pinned } : a))
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "news": return <Megaphone className="h-4 w-4 text-blue-500" />
      case "policy": return <FileText className="h-4 w-4 text-purple-500" />
      case "circular": return <FileText className="h-4 w-4 text-orange-500" />
      case "notice": return <Bell className="h-4 w-4 text-yellow-500" />
      case "event": return <Calendar className="h-4 w-4 text-green-500" />
      case "memo": return <FileText className="h-4 w-4 text-gray-500" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent": return <Badge variant="destructive">Urgent</Badge>
      case "high": return <Badge variant="warning">High</Badge>
      case "normal": return <Badge variant="secondary">Normal</Badge>
      case "low": return <Badge variant="outline">Low</Badge>
      default: return <Badge variant="secondary">{priority}</Badge>
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-56 h-9 bg-muted rounded animate-pulse" />
          <div className="w-80 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map(i => <div key={i} className="w-32 h-9 bg-muted rounded animate-pulse" />)}
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6" />
            Content Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage staff corner, announcements, and notifications
          </p>
        </div>
      </div>

      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="staff" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Staff Corner
          </TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="notifications">Push Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="staff">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Staff Corner Content</CardTitle>
              <Button size="sm" onClick={() => openDialog("staff")}>
                <Plus className="mr-2 h-4 w-4" />
                Add Content
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffCorner.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No staff corner content yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    staffCorner.map((item) => (
                      <TableRow key={item.id} className="group hover:bg-muted/50 transition-colors">
                        <TableCell className="w-8">
                          {item.is_pinned && <Pin className="h-4 w-4 text-primary" />}
                        </TableCell>
                        <TableCell className="w-16">
                          {item.image_url ? (
                            <img src={item.image_url} alt="" className="w-12 h-12 rounded object-cover" />
                          ) : (
                            <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.title}</p>
                            {item.subtitle && (
                              <p className="text-sm text-muted-foreground truncate max-w-[250px]">{item.subtitle}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(item.category)}
                            <span className="capitalize">{item.category}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getPriorityBadge(item.priority)}</TableCell>
                        <TableCell>
                          <Badge variant={item.is_active ? "success" : "secondary"}>
                            {item.is_active ? "Active" : "Draft"}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.published_at ? formatDate(item.published_at) : "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openDialog("staff", item)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => openDialog("staff", item)}>
                                  <Edit className="mr-2 h-4 w-4" />Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => togglePin(item)}>
                                  <Pin className="mr-2 h-4 w-4" />
                                  {item.is_pinned ? "Unpin" : "Pin to Top"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onSelect={() => handleDelete("staff", item.id)}>
                                  <Trash2 className="mr-2 h-4 w-4" />Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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

        <TabsContent value="announcements">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Announcements</CardTitle>
              <Button size="sm" onClick={() => openDialog("announcement")}>
                <Plus className="mr-2 h-4 w-4" />
                New Announcement
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {announcements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No announcements yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    announcements.map((ann) => (
                      <TableRow key={ann.id} className="group hover:bg-muted/50 transition-colors">
                        <TableCell className="w-8">
                          {ann.is_pinned && <Pin className="h-4 w-4 text-primary" />}
                        </TableCell>
                        <TableCell className="w-16">
                          {ann.image_url ? (
                            <img src={ann.image_url} alt="" className="w-12 h-12 rounded object-cover" />
                          ) : (
                            <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                              <Megaphone className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{ann.title}</p>
                            {ann.message && (
                              <p className="text-sm text-muted-foreground truncate max-w-[250px]">{ann.message}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{ann.category || "general"}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={ann.priority === "high" ? "destructive" : "secondary"}>
                            {ann.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={ann.is_active ? "success" : "secondary"}>
                            {ann.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(ann.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openDialog("announcement", ann)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => openDialog("announcement", ann)}>
                                  <Edit className="mr-2 h-4 w-4" />Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => toggleAnnouncementPin(ann)}>
                                  <Pin className="mr-2 h-4 w-4" />
                                  {ann.is_pinned ? "Unpin" : "Pin to Top"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onSelect={() => handleDelete("announcement", ann.id)}>
                                  <Trash2 className="mr-2 h-4 w-4" />Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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

        <TabsContent value="notifications">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Push Notification History</CardTitle>
              <Button size="sm" onClick={() => openDialog("push")}>
                <Bell className="mr-2 h-4 w-4" />
                Send Push
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Success</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No push notifications sent yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    notifications.map((notif) => (
                      <TableRow key={notif.id}>
                        <TableCell className="font-medium">{notif.title}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">{notif.body}</TableCell>
                        <TableCell><Badge variant="secondary">{notif.target_type}</Badge></TableCell>
                        <TableCell>{notif.sent_count}</TableCell>
                        <TableCell className="text-green-500">{notif.success_count}</TableCell>
                        <TableCell>{formatDate(notif.sent_at)}</TableCell>
                        <TableCell>
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => openDialog("push", notif)}>
                                <Edit className="mr-2 h-4 w-4" />Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onSelect={() => handleDelete("push", notif.id)}>
                                <Trash2 className="mr-2 h-4 w-4" />Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Staff Corner Dialog */}
      <Dialog open={dialogType === "staff"} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedItem ? "Edit Staff Content" : "Add Staff Content"}</DialogTitle>
            <DialogDescription>
              Create news, policies, circulars, and notices for staff
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Image</label>
              <ImagePicker
                value={formData.image_url || ""}
                onChange={(url) => setFormData({ ...formData, image_url: url })}
                folder="staff-corner"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Title *</label>
              <Input
                value={formData.title || ""}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter title"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Subtitle</label>
              <Input
                value={formData.subtitle || ""}
                onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                placeholder="Brief description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Category</label>
                <ComboboxInput
                  value={formData.category || "news"}
                  onChange={(v) => setFormData({ ...formData, category: v })}
                  options={STAFF_CATEGORIES}
                  placeholder="Select category"
                  allowCustom={true}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Priority</label>
                <Select
                  value={formData.priority || "normal"}
                  onValueChange={(v) => setFormData({ ...formData, priority: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.is_pinned || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_pinned: checked })}
                />
                <span className="text-sm">Pin to top</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.is_active ?? true}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <span className="text-sm">Active</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Announcement Dialog */}
      <Dialog open={dialogType === "announcement"} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedItem ? "Edit Announcement" : "New Announcement"}</DialogTitle>
            <DialogDescription>Create announcements with images for the mobile app</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Image</label>
              <ImagePicker
                value={formData.image_url || ""}
                onChange={(url) => setFormData({ ...formData, image_url: url })}
                folder="announcements"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Title *</label>
              <Input value={formData.title || ""} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Announcement title" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Subtitle</label>
              <Input value={formData.subtitle || ""} onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })} placeholder="Brief description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Category</label>
                <ComboboxInput
                  value={formData.category || "general"}
                  onChange={(v) => setFormData({ ...formData, category: v })}
                  options={ANNOUNCEMENT_CATEGORIES}
                  placeholder="Select category"
                  allowCustom={true}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Priority</label>
                <Select value={formData.priority || "normal"} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.is_pinned || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_pinned: checked })}
                />
                <span className="text-sm">Pin to top</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.is_active ?? true}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <span className="text-sm">Active</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Push Notification Dialog */}
      <Dialog open={dialogType === "push"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedItem ? "Edit Push Notification" : "Send Push Notification"}</DialogTitle>
            <DialogDescription>{selectedItem ? "Update notification details" : "Send a push notification to users"}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Title *</label>
              <Input value={formData.title || ""} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Notification title" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Message *</label>
              <Textarea value={formData.body || ""} onChange={(e) => setFormData({ ...formData, body: e.target.value })} placeholder="Notification message" rows={3} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Target</label>
              <Select value={formData.target_type || "all"} onValueChange={(v) => setFormData({ ...formData, target_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="customers">Customers Only</SelectItem>
                  <SelectItem value="drivers">Drivers Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : selectedItem ? "Update" : "Send Notification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
