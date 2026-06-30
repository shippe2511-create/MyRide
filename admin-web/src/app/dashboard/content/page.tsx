"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PermissionGate } from "@/components/permission-gate"
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
import { Switch } from "@/components/ui/switch"
import { ImagePicker } from "@/components/ui/image-picker"
import { ComboboxInput } from "@/components/ui/combobox-input"
import { Plus, Edit, Trash2, MoreHorizontal, Loader2, Bell, Pin, Users, FileText, Megaphone, Calendar, Download, Coffee, Quote, GripVertical } from "lucide-react"
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

// Sortable table row component for announcements
function SortableAnnouncementRow({ ann, onEdit, onDelete, onToggleStatus, formatDate }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ann.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <TableRow ref={setNodeRef} style={style} className="group hover:bg-muted/50 transition-colors">
      <TableCell className="w-8">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
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
          {ann.message && <p className="text-sm text-muted-foreground truncate max-w-[250px]">{ann.message}</p>}
        </div>
      </TableCell>
      <TableCell><Badge variant="outline" className="capitalize">{ann.category || "general"}</Badge></TableCell>
      <TableCell><Badge variant={ann.priority === "high" ? "destructive" : "secondary"}>{ann.priority}</Badge></TableCell>
      <TableCell><Switch checked={ann.is_active} onCheckedChange={() => onToggleStatus(ann)} /></TableCell>
      <TableCell>{formatDate(ann.created_at)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(ann)}><Edit className="h-4 w-4" /></Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(ann)}><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onSelect={() => onDelete(ann.id)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}

// Sortable row for Staff Corner
function SortableStaffRow({ item, onEdit, onDelete, onToggleStatus, getCategoryIcon, formatDate }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <TableRow ref={setNodeRef} style={style} className="group hover:bg-muted/50 transition-colors">
      <TableCell className="w-8">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell className="w-16">
        {item.image_url ? <img src={item.image_url} alt="" className="w-12 h-12 rounded object-cover" /> : <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">{getCategoryIcon(item.category)}</div>}
      </TableCell>
      <TableCell>
        <div><p className="font-medium">{item.title}</p>{item.subtitle && <p className="text-sm text-muted-foreground truncate max-w-[200px]">{item.subtitle}</p>}</div>
      </TableCell>
      <TableCell><div className="flex items-center gap-2">{getCategoryIcon(item.category)}<span className="capitalize">{item.category}</span></div></TableCell>
      <TableCell><Badge variant={item.priority === "high" ? "destructive" : "secondary"}>{item.priority || "normal"}</Badge></TableCell>
      <TableCell><Switch checked={item.is_active} onCheckedChange={() => onToggleStatus(item)} /></TableCell>
      <TableCell>{item.published_at ? formatDate(item.published_at) : "-"}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(item)}><Edit className="h-4 w-4" /></Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(item)}><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onSelect={() => onDelete(item.id)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}

// Sortable row for Break Tips
function SortableBreakTipRow({ tip, onEdit, onDelete, onToggleStatus }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tip.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const icons: Record<string, string> = { eye: "👁️", water: "💧", stretch: "🧘", walk: "🚶", breathe: "🌬️", music: "🎵" }

  return (
    <TableRow ref={setNodeRef} style={style} className="group hover:bg-muted/50 transition-colors">
      <TableCell className="w-8">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell className="text-2xl">{icons[tip.icon] || "💡"}</TableCell>
      <TableCell><p className="font-medium">{tip.title}</p><p className="text-sm text-muted-foreground">{tip.description}</p></TableCell>
      <TableCell><Switch checked={tip.is_active} onCheckedChange={() => onToggleStatus(tip)} /></TableCell>
      <TableCell>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(tip)}><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(tip.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// Sortable row for Quotes
function SortableQuoteRow({ quote, onEdit, onDelete, onToggleStatus }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: quote.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <TableRow ref={setNodeRef} style={style} className="group hover:bg-muted/50 transition-colors">
      <TableCell className="w-8">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell className="max-w-md"><p className="italic">&ldquo;{quote.quote}&rdquo;</p></TableCell>
      <TableCell className="text-muted-foreground">{quote.author || "-"}</TableCell>
      <TableCell><Switch checked={quote.is_active} onCheckedChange={() => onToggleStatus(quote)} /></TableCell>
      <TableCell>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(quote)}><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onSelect={() => onDelete(quote.id)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

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
  const [breakTips, setBreakTips] = useState<any[]>([])
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogType, setDialogType] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<any>({})

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleAnnouncementDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = announcements.findIndex(a => a.id === active.id)
    const newIndex = announcements.findIndex(a => a.id === over.id)

    const newAnnouncements = arrayMove(announcements, oldIndex, newIndex)
    setAnnouncements(newAnnouncements)

    // Update sort_order in database
    const updates = newAnnouncements.map((ann, i) =>
      supabase.from("announcements").update({ sort_order: i }).eq("id", ann.id)
    )
    await Promise.all(updates)
  }

  const handleStaffCornerDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = staffCorner.findIndex(s => s.id === active.id)
    const newIndex = staffCorner.findIndex(s => s.id === over.id)
    const newItems = arrayMove(staffCorner, oldIndex, newIndex)
    setStaffCorner(newItems)
    const updates = newItems.map((item, i) => supabase.from("staff_corner").update({ sort_order: i }).eq("id", item.id))
    await Promise.all(updates)
  }

  const handleBreakTipsDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = breakTips.findIndex(t => t.id === active.id)
    const newIndex = breakTips.findIndex(t => t.id === over.id)
    const newItems = arrayMove(breakTips, oldIndex, newIndex)
    setBreakTips(newItems)
    const updates = newItems.map((item, i) => supabase.from("break_tips").update({ sort_order: i }).eq("id", item.id))
    await Promise.all(updates)
  }

  const handleQuotesDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = quotes.findIndex(q => q.id === active.id)
    const newIndex = quotes.findIndex(q => q.id === over.id)
    const newItems = arrayMove(quotes, oldIndex, newIndex)
    setQuotes(newItems)
    const updates = newItems.map((item, i) => supabase.from("motivational_quotes").update({ sort_order: i }).eq("id", item.id))
    await Promise.all(updates)
  }

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [announcementsRes, notificationsRes, staffCornerRes, breakTipsRes, quotesRes] = await Promise.all([
      supabase.from("announcements").select("*").order("sort_order", { ascending: true }),
      supabase.from("push_notification_logs").select("*").order("sent_at", { ascending: false }).limit(20),
      supabase.from("staff_corner").select("*").order("sort_order", { ascending: true }),
      supabase.from("break_tips").select("*").order("sort_order", { ascending: true }),
      supabase.from("motivational_quotes").select("*").order("sort_order", { ascending: true }),
    ])
    setAnnouncements(announcementsRes.data || [])
    setNotifications(notificationsRes.data || [])
    setStaffCorner(staffCornerRes.data || [])
    setBreakTips(breakTipsRes.data || [])
    setQuotes(quotesRes.data || [])
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
    } else if (type === "break_tip") {
      setFormData({
        title: item?.title || "",
        description: item?.description || "",
        icon: item?.icon || "lightbulb",
        sort_order: item?.sort_order || 0,
        is_active: item?.is_active ?? true
      })
    } else if (type === "quote") {
      setFormData({
        quote: item?.quote || "",
        author: item?.author || "",
        is_active: item?.is_active ?? true
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
        message: formData.subtitle || '',
        category: formData.category || "general",
        priority: formData.priority || 'normal',
        target_audience: 'all',
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
    } else if (dialogType === "break_tip") {
      if (!formData.title.trim() || !formData.description.trim()) {
        toast.error("Title and description are required")
        setSaving(false)
        return
      }
      const payload = {
        title: formData.title,
        description: formData.description,
        icon: formData.icon,
        sort_order: formData.sort_order || 0,
        is_active: formData.is_active,
        updated_at: new Date().toISOString()
      }
      if (selectedItem) {
        const res = await supabase.from("break_tips").update(payload).eq("id", selectedItem.id)
        error = res.error
      } else {
        const res = await supabase.from("break_tips").insert(payload)
        error = res.error
      }
    } else if (dialogType === "quote") {
      if (!formData.quote.trim()) {
        toast.error("Quote text is required")
        setSaving(false)
        return
      }
      const payload = {
        quote: formData.quote,
        author: formData.author || null,
        is_active: formData.is_active
      }
      if (selectedItem) {
        const res = await supabase.from("motivational_quotes").update(payload).eq("id", selectedItem.id)
        error = res.error
      } else {
        const res = await supabase.from("motivational_quotes").insert(payload)
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
          const { data } = await supabase.from("announcements").select("*").order("sort_order", { ascending: true })
          if (data) setAnnouncements(data)
        }
      } else if (dialogType === "staff") {
        if (selectedItem) {
          setStaffCorner(prev => prev.map(s => s.id === selectedItem.id ? { ...s, ...formData } as StaffCornerItem : s))
        } else {
          const { data } = await supabase.from("staff_corner").select("*").order("is_pinned", { ascending: false }).order("created_at", { ascending: false })
          if (data) setStaffCorner(data)
        }
      } else if (dialogType === "break_tip") {
        const { data } = await supabase.from("break_tips").select("*").order("sort_order", { ascending: true })
        if (data) setBreakTips(data)
      } else if (dialogType === "quote") {
        const { data } = await supabase.from("motivational_quotes").select("*").order("created_at", { ascending: false })
        if (data) setQuotes(data)
      }
    }
    setSaving(false)
    setDialogType(null)
  }

  const handleDelete = async (type: string, id: string) => {
    let table = "announcements"
    if (type === "staff") table = "staff_corner"
    else if (type === "push") table = "push_notification_logs"
    else if (type === "break_tip") table = "break_tips"
    else if (type === "quote") table = "motivational_quotes"

    const { error } = await supabase.from(table).delete().eq("id", id)
    if (error) toast.error("Failed to delete")
    else {
      toast.success("Deleted")
      if (type === "staff") {
        setStaffCorner(prev => prev.filter(s => s.id !== id))
      } else if (type === "announcement") {
        setAnnouncements(prev => prev.filter(a => a.id !== id))
      } else if (type === "break_tip") {
        setBreakTips(prev => prev.filter(b => b.id !== id))
      } else if (type === "quote") {
        setQuotes(prev => prev.filter(q => q.id !== id))
      }
    }
  }

  const toggleBreakTipStatus = async (tip: any) => {
    // Optimistic update first
    const newValue = !tip.is_active
    setBreakTips(prev => prev.map(t => t.id === tip.id ? { ...t, is_active: newValue } : t))

    const { error } = await supabase
      .from("break_tips")
      .update({ is_active: newValue })
      .eq("id", tip.id)
    if (error) {
      toast.error("Failed to update tip status")
      // Revert on error
      setBreakTips(prev => prev.map(t => t.id === tip.id ? { ...t, is_active: !newValue } : t))
    }
  }

  const toggleQuoteStatus = async (quote: any) => {
    // Optimistic update first
    const newValue = !quote.is_active
    setQuotes(prev => prev.map(q => q.id === quote.id ? { ...q, is_active: newValue } : q))

    const { error } = await supabase
      .from("motivational_quotes")
      .update({ is_active: newValue })
      .eq("id", quote.id)
    if (error) {
      toast.error("Failed to update quote status")
      // Revert on error
      setQuotes(prev => prev.map(q => q.id === quote.id ? { ...q, is_active: !newValue } : q))
    }
  }

  const togglePin = async (item: StaffCornerItem) => {
    // Optimistic update first
    const newValue = !item.is_pinned
    setStaffCorner(prev => prev.map(s => s.id === item.id ? { ...s, is_pinned: newValue } : s))

    const { error } = await supabase
      .from("staff_corner")
      .update({ is_pinned: newValue })
      .eq("id", item.id)
    if (error) {
      toast.error("Failed to update pin status")
      setStaffCorner(prev => prev.map(s => s.id === item.id ? { ...s, is_pinned: !newValue } : s))
    } else {
      toast.success(newValue ? "Pinned" : "Unpinned")
    }
  }

  const toggleStaffStatus = async (item: StaffCornerItem) => {
    // Optimistic update first
    const newValue = !item.is_active
    setStaffCorner(prev => prev.map(s => s.id === item.id ? { ...s, is_active: newValue } : s))

    const { error } = await supabase
      .from("staff_corner")
      .update({ is_active: newValue })
      .eq("id", item.id)
    if (error) {
      toast.error("Failed to update staff corner status")
      setStaffCorner(prev => prev.map(s => s.id === item.id ? { ...s, is_active: !newValue } : s))
    }
  }

  const toggleAnnouncementPin = async (item: { id: string; is_pinned: boolean }) => {
    // Optimistic update first
    const newValue = !item.is_pinned
    setAnnouncements(prev => prev.map(a => a.id === item.id ? { ...a, is_pinned: newValue } : a))

    const { error } = await supabase
      .from("announcements")
      .update({ is_pinned: newValue })
      .eq("id", item.id)
    if (error) {
      toast.error("Failed to update pin status")
      setAnnouncements(prev => prev.map(a => a.id === item.id ? { ...a, is_pinned: !newValue } : a))
    } else {
      toast.success(newValue ? "Pinned" : "Unpinned")
    }
  }

  const toggleAnnouncementStatus = async (item: { id: string; is_active: boolean }) => {
    // Optimistic update first
    const newValue = !item.is_active
    setAnnouncements(prev => prev.map(a => a.id === item.id ? { ...a, is_active: newValue } : a))

    const { error } = await supabase
      .from("announcements")
      .update({ is_active: newValue })
      .eq("id", item.id)
    if (error) {
      toast.error("Failed to update announcement status")
      setAnnouncements(prev => prev.map(a => a.id === item.id ? { ...a, is_active: !newValue } : a))
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
    <PermissionGate permission="content:view">
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
          <TabsTrigger value="break_tips" className="flex items-center gap-2">
            <Coffee className="h-4 w-4" />
            Break Tips
          </TabsTrigger>
          <TabsTrigger value="quotes" className="flex items-center gap-2">
            <Quote className="h-4 w-4" />
            Quotes
          </TabsTrigger>
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
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStaffCornerDragEnd}>
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
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No staff corner content yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      <SortableContext items={staffCorner.map(s => s.id)} strategy={verticalListSortingStrategy}>
                        {staffCorner.map((item) => (
                          <SortableStaffRow
                            key={item.id}
                            item={item}
                            onEdit={(i: any) => openDialog("staff", i)}
                            onDelete={(id: string) => handleDelete("staff", id)}
                            onToggleStatus={toggleStaffStatus}
                            getCategoryIcon={getCategoryIcon}
                            formatDate={formatDate}
                          />
                        ))}
                      </SortableContext>
                    )}
                  </TableBody>
                </Table>
              </DndContext>
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
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleAnnouncementDragEnd}>
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
                      <SortableContext items={announcements.map(a => a.id)} strategy={verticalListSortingStrategy}>
                        {announcements.map((ann) => (
                          <SortableAnnouncementRow
                            key={ann.id}
                            ann={ann}
                            onEdit={(a: any) => openDialog("announcement", a)}
                            onDelete={(id: string) => handleDelete("announcement", id)}
                            onToggleStatus={toggleAnnouncementStatus}
                            formatDate={formatDate}
                          />
                        ))}
                      </SortableContext>
                    )}
                  </TableBody>
                </Table>
              </DndContext>
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

        {/* Break Tips Tab */}
        <TabsContent value="break_tips">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Break Tips</CardTitle>
              <Button size="sm" onClick={() => openDialog("break_tip")}>
                <Plus className="mr-2 h-4 w-4" />
                Add Tip
              </Button>
            </CardHeader>
            <CardContent>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBreakTipsDragEnd}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead></TableHead>
                      <TableHead>Icon</TableHead>
                      <TableHead>Title & Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakTips.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No break tips yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      <SortableContext items={breakTips.map(t => t.id)} strategy={verticalListSortingStrategy}>
                        {breakTips.map((tip) => (
                          <SortableBreakTipRow
                            key={tip.id}
                            tip={tip}
                            onEdit={(t: any) => openDialog("break_tip", t)}
                            onDelete={(id: string) => handleDelete("break_tip", id)}
                            onToggleStatus={toggleBreakTipStatus}
                          />
                        ))}
                      </SortableContext>
                    )}
                  </TableBody>
                </Table>
              </DndContext>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quotes Tab */}
        <TabsContent value="quotes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Motivational Quotes</CardTitle>
              <Button size="sm" onClick={() => openDialog("quote")}>
                <Plus className="mr-2 h-4 w-4" />
                Add Quote
              </Button>
            </CardHeader>
            <CardContent>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleQuotesDragEnd}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead></TableHead>
                      <TableHead>Quote</TableHead>
                      <TableHead>Author</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No quotes yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      <SortableContext items={quotes.map(q => q.id)} strategy={verticalListSortingStrategy}>
                        {quotes.map((quote) => (
                          <SortableQuoteRow
                            key={quote.id}
                            quote={quote}
                            onEdit={(q: any) => openDialog("quote", q)}
                            onDelete={(id: string) => handleDelete("quote", id)}
                            onToggleStatus={toggleQuoteStatus}
                          />
                        ))}
                      </SortableContext>
                    )}
                  </TableBody>
                </Table>
              </DndContext>
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

      {/* Break Tip Dialog */}
      <Dialog open={dialogType === "break_tip"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedItem ? "Edit Break Tip" : "Add Break Tip"}</DialogTitle>
            <DialogDescription>
              Tips shown to drivers during their break
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="e.g., Stretch your legs"
                value={formData.title || ""}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="e.g., Take a short walk to refresh"
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Icon</label>
                <Select value={formData.icon || "lightbulb"} onValueChange={(v) => setFormData({ ...formData, icon: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="directions_walk">Walk</SelectItem>
                    <SelectItem value="water_drop">Water</SelectItem>
                    <SelectItem value="visibility">Eyes</SelectItem>
                    <SelectItem value="restaurant">Food</SelectItem>
                    <SelectItem value="self_improvement">Relax</SelectItem>
                    <SelectItem value="lightbulb">Idea</SelectItem>
                    <SelectItem value="favorite">Heart</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Sort Order</label>
                <Input
                  type="number"
                  value={formData.sort_order || 0}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="tip_active"
                checked={formData.is_active}
                onCheckedChange={(c) => setFormData({ ...formData, is_active: !!c })}
              />
              <label htmlFor="tip_active" className="text-sm">Active</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : selectedItem ? "Update" : "Add Tip"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quote Dialog */}
      <Dialog open={dialogType === "quote"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedItem ? "Edit Quote" : "Add Quote"}</DialogTitle>
            <DialogDescription>
              Motivational quotes shown to drivers during breaks
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Quote</label>
              <Textarea
                placeholder="A moment of rest today leads to safer journeys tomorrow."
                value={formData.quote || ""}
                onChange={(e) => setFormData({ ...formData, quote: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Author (optional)</label>
              <Input
                placeholder="e.g., Anonymous"
                value={formData.author || ""}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="quote_active"
                checked={formData.is_active}
                onCheckedChange={(c) => setFormData({ ...formData, is_active: !!c })}
              />
              <label htmlFor="quote_active" className="text-sm">Active</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : selectedItem ? "Update" : "Add Quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGate>
  )
}
