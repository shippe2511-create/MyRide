"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  ClipboardCheck, AlertTriangle, CheckCircle, XCircle, Car,
  Loader2, RefreshCw, Download, MoreHorizontal, Pencil, Trash2, Search, Eye, Flag, X,
  Activity, BarChart3, FileDown, FileSpreadsheet, Clock, TrendingUp,
  Armchair, ShieldCheck, Wrench, Settings, Gauge, Zap, Disc, Sun, Wind, Droplet, FileText,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { PermissionGate } from "@/components/permission-gate"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"

interface IssueDetail {
  note: string
  photos?: string[]
}

interface VehicleChecklist {
  id: string
  driver_name: string
  vehicle_number: string
  has_issues: boolean
  issues: Record<string, string | IssueDetail> | null
  all_items: Record<string, boolean> | null
  checked_at: string
  remarks: string | null
  resolution_status: 'pending' | 'fixed' | 'deferred' | 'not_applicable' | null
  resolved_at: string | null
  resolved_by: string | null
  resolution_notes: string | null
}

interface VehicleHealth {
  vehicle_number: string
  display_name: string
  total_checks: number
  total_issues: number
  pending_issues: number
  fixed_issues: number
  deferred_issues: number
  last_check: string | null
  first_check: string | null
  most_common_issue: string | null
  issue_breakdown: Record<string, number>
  health_score: number
  days_in_service: number
  current_running_hours: number
  last_running_hours_update: string | null
  next_service_hours: number | null
  service_interval_hours: number
}

interface ChecklistCategory {
  id: string
  name: string
  icon: string
  sort_order: number
  is_active: boolean
  items?: ChecklistItem[]
}

interface ChecklistItem {
  id: string
  category_id: string
  key: string
  title: string
  description: string | null
  icon: string
  sort_order: number
  is_active: boolean
}

const ITEM_LABELS: Record<string, string> = {
  fuel: "Fuel Level", tires: "Tires", lights: "Lights", body: "Body Condition",
  ac: "A/C", safety: "Safety Kit", documents: "Documents", seatbelts: "Seatbelts", cleanliness: "Cleanliness",
}

const PAGE_SIZE = 15

const TABS = [
  { id: "checks", label: "Checks", icon: ClipboardCheck },
  { id: "items", label: "Manage Items", icon: Pencil },
  { id: "fleet", label: "Fleet Health", icon: Activity },
  { id: "reports", label: "Reports", icon: FileDown },
]

const REPORT_TYPES = [
  { id: "fleet-health", name: "Fleet Health Summary", icon: Activity },
  { id: "all-issues", name: "All Vehicle Issues", icon: AlertTriangle },
  { id: "vehicle-checks", name: "Pre-trip Inspections", icon: ClipboardCheck },
  { id: "issue-breakdown", name: "Issue Breakdown", icon: BarChart3 },
  { id: "pending-issues", name: "Pending Issues", icon: Clock },
  { id: "resolved-issues", name: "Resolved Issues", icon: CheckCircle },
  { id: "vehicle-lifespan", name: "Vehicle Lifespan", icon: TrendingUp },
  { id: "vehicle-history", name: "Vehicle Change History", icon: Activity },
]

const ICON_MAP: Record<string, LucideIcon> = {
  car: Car,
  armchair: Armchair,
  "shield-check": ShieldCheck,
  clipboard: ClipboardCheck,
  wrench: Wrench,
  settings: Settings,
  gauge: Gauge,
  zap: Zap,
  disc: Disc,
  sun: Sun,
  wind: Wind,
  droplet: Droplet,
  "file-text": FileText,
  "alert-triangle": AlertTriangle,
  check: CheckCircle,
  eye: Eye,
}

function SortableItem({ item, openEditItem, toggleItemActive, setDeleteItemId }: {
  item: ChecklistItem
  openEditItem: (item: ChecklistItem) => void
  toggleItemActive: (item: ChecklistItem) => void
  setDeleteItemId: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center justify-between p-3 rounded-lg bg-muted/50",
        !item.is_active && "opacity-60",
        isDragging && "shadow-lg"
      )}
    >
      <div className="flex items-center gap-3">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <CheckCircle className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="font-medium flex items-center gap-2">
            {item.title}
            {!item.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
          </p>
          {item.description && (
            <p className="text-sm text-muted-foreground">{item.description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditItem(item) }}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); toggleItemActive(item) }}>
          {item.is_active ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="text-red-600" onClick={(e) => { e.stopPropagation(); setDeleteItemId(item.id) }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default function ChecklistsPage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState("checks")
  const [checklists, setChecklists] = useState<VehicleChecklist[]>([])
  const [allChecklists, setAllChecklists] = useState<VehicleChecklist[]>([])
  const [vehicleHealthData, setVehicleHealthData] = useState<VehicleHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [selectedChecklist, setSelectedChecklist] = useState<VehicleChecklist | null>(null)
  const [editingChecklist, setEditingChecklist] = useState<VehicleChecklist | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split("T")[0]
  })
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]
  })

  // Checklist items management state
  const [categories, setCategories] = useState<ChecklistCategory[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ChecklistCategory | null>(null)
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null)
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null)
  const [categoryForm, setCategoryForm] = useState({ name: "", icon: "clipboard" })
  const [itemForm, setItemForm] = useState({ category_id: "", key: "", title: "", description: "", icon: "check" })

  const [stats, setStats] = useState({ total: 0, withIssues: 0, passed: 0 })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = async (event: DragEndEvent, categoryId: string) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const category = categories.find(c => c.id === categoryId)
    if (!category?.items) return

    const oldIndex = category.items.findIndex(i => i.id === active.id)
    const newIndex = category.items.findIndex(i => i.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const newItems = arrayMove(category.items, oldIndex, newIndex)

    // Update local state immediately for smooth UX
    setCategories(prev => prev.map(c =>
      c.id === categoryId ? { ...c, items: newItems } : c
    ))

    // Update sort_order in database
    try {
      const updates = newItems.map((item, index) =>
        supabase.from("checklist_items").update({ sort_order: index }).eq("id", item.id)
      )
      await Promise.all(updates)
    } catch (e) {
      toast.error("Failed to save order")
      loadChecklistItems(false)
    }
  }

  useEffect(() => {
    loadData(true)

    const channel = supabase
      .channel('checklists_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_checklists' }, () => {
        loadData(false)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_types' }, () => {
        loadData(false)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_categories' }, () => {
        loadChecklistItems(false)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items' }, () => {
        loadChecklistItems(false)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (!loading) loadChecklists(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, currentPage])

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    await Promise.all([loadChecklists(showLoading), loadFleetHealth(), loadChecklistItems()])
    if (showLoading) setLoading(false)
  }

  const loadChecklistItems = async (showLoading = true) => {
    if (showLoading) setItemsLoading(true)
    try {
      const [categoriesRes, itemsRes] = await Promise.all([
        supabase.from("checklist_categories").select("*").order("sort_order"),
        supabase.from("checklist_items").select("*").order("sort_order"),
      ])

      const cats = (categoriesRes.data || []) as ChecklistCategory[]
      const items = (itemsRes.data || []) as ChecklistItem[]

      // Attach items to their categories
      const catsWithItems = cats.map(cat => ({
        ...cat,
        items: items.filter(item => item.category_id === cat.id)
      }))

      setCategories(catsWithItems)
    } catch (e) {
      console.error("Error loading checklist items:", e)
      toast.error("Failed to load checklist items")
    } finally {
      if (showLoading) setItemsLoading(false)
    }
  }

  // Category CRUD
  const openAddCategory = () => {
    setEditingCategory(null)
    setCategoryForm({ name: "", icon: "clipboard" })
    setCategoryDialogOpen(true)
  }

  const openEditCategory = (cat: ChecklistCategory) => {
    setEditingCategory(cat)
    setCategoryForm({ name: cat.name, icon: cat.icon })
    setCategoryDialogOpen(true)
  }

  const saveCategory = async () => {
    if (!categoryForm.name.trim()) {
      toast.error("Category name is required")
      return
    }
    setSaving(true)
    try {
      if (editingCategory) {
        await supabase.from("checklist_categories").update({
          name: categoryForm.name,
          icon: categoryForm.icon,
          updated_at: new Date().toISOString()
        }).eq("id", editingCategory.id)
        toast.success("Category updated")
      } else {
        const maxOrder = Math.max(0, ...categories.map(c => c.sort_order))
        await supabase.from("checklist_categories").insert({
          name: categoryForm.name,
          icon: categoryForm.icon,
          sort_order: maxOrder + 1
        })
        toast.success("Category added")
      }
      setCategoryDialogOpen(false)
      loadChecklistItems(false)
    } catch (e) {
      toast.error("Failed to save category")
    } finally {
      setSaving(false)
    }
  }

  const deleteCategory = async () => {
    if (!deleteCategoryId) return
    setSaving(true)
    try {
      await supabase.from("checklist_categories").delete().eq("id", deleteCategoryId)
      toast.success("Category deleted")
      setDeleteCategoryId(null)
      loadChecklistItems(false)
    } catch (e) {
      toast.error("Failed to delete category")
    } finally {
      setSaving(false)
    }
  }

  const toggleCategoryActive = async (cat: ChecklistCategory) => {
    try {
      await supabase.from("checklist_categories").update({ is_active: !cat.is_active }).eq("id", cat.id)
      loadChecklistItems(false)
    } catch (e) {
      toast.error("Failed to update category")
    }
  }

  // Item CRUD
  const openAddItem = (categoryId: string) => {
    setEditingItem(null)
    setItemForm({ category_id: categoryId, key: "", title: "", description: "", icon: "check" })
    setItemDialogOpen(true)
  }

  const openEditItem = (item: ChecklistItem) => {
    setEditingItem(item)
    setItemForm({
      category_id: item.category_id,
      key: item.key,
      title: item.title,
      description: item.description || "",
      icon: item.icon
    })
    setItemDialogOpen(true)
  }

  const saveItem = async () => {
    if (!itemForm.title.trim() || !itemForm.key.trim()) {
      toast.error("Title and Key are required")
      return
    }
    setSaving(true)
    try {
      if (editingItem) {
        await supabase.from("checklist_items").update({
          title: itemForm.title,
          description: itemForm.description || null,
          icon: itemForm.icon,
          updated_at: new Date().toISOString()
        }).eq("id", editingItem.id)
        toast.success("Item updated")
      } else {
        const catItems = categories.find(c => c.id === itemForm.category_id)?.items || []
        const maxOrder = Math.max(0, ...catItems.map(i => i.sort_order))
        await supabase.from("checklist_items").insert({
          category_id: itemForm.category_id,
          key: itemForm.key.toLowerCase().replace(/\s+/g, '_'),
          title: itemForm.title,
          description: itemForm.description || null,
          icon: itemForm.icon,
          sort_order: maxOrder + 1
        })
        toast.success("Item added")
      }
      setItemDialogOpen(false)
      loadChecklistItems(false)
    } catch (e) {
      toast.error("Failed to save item")
    } finally {
      setSaving(false)
    }
  }

  const deleteItem = async () => {
    if (!deleteItemId) return
    setSaving(true)
    try {
      await supabase.from("checklist_items").delete().eq("id", deleteItemId)
      toast.success("Item deleted")
      setDeleteItemId(null)
      loadChecklistItems(false)
    } catch (e) {
      toast.error("Failed to delete item")
    } finally {
      setSaving(false)
    }
  }

  const toggleItemActive = async (item: ChecklistItem) => {
    try {
      await supabase.from("checklist_items").update({ is_active: !item.is_active }).eq("id", item.id)
      loadChecklistItems(false)
    } catch (e) {
      toast.error("Failed to update item")
    }
  }

  const loadChecklists = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    const start = (currentPage - 1) * PAGE_SIZE
    const end = start + PAGE_SIZE - 1

    let query = supabase.from("vehicle_checklists").select("*", { count: "exact" }).order("checked_at", { ascending: false }).range(start, end)
    let countQuery = supabase.from("vehicle_checklists").select("*", { count: "exact", head: true })

    if (filter === "issues") {
      query = query.eq("has_issues", true)
      countQuery = countQuery.eq("has_issues", true)
    }
    if (filter === "passed") {
      query = query.eq("has_issues", false)
      countQuery = countQuery.eq("has_issues", false)
    }

    const [checklistsRes, filteredCountRes, totalRes, issuesRes, passedRes, allRes] = await Promise.all([
      query,
      countQuery,
      supabase.from("vehicle_checklists").select("*", { count: "exact", head: true }),
      supabase.from("vehicle_checklists").select("*", { count: "exact", head: true }).eq("has_issues", true),
      supabase.from("vehicle_checklists").select("*", { count: "exact", head: true }).eq("has_issues", false),
      supabase.from("vehicle_checklists").select("*").order("checked_at", { ascending: false }),
    ])

    setChecklists(checklistsRes.data || [])
    setAllChecklists(allRes.data || [])
    setTotalCount(filteredCountRes.count || 0)
    setStats({ total: totalRes.count || 0, withIssues: issuesRes.count || 0, passed: passedRes.count || 0 })
    if (showLoading) setLoading(false)
  }

  const loadFleetHealth = async () => {
    const [vehiclesRes, checklistsRes] = await Promise.all([
      supabase.from("vehicle_types").select("plate_no, display_name, is_active, created_at, current_running_hours, last_running_hours_update, next_service_hours, service_interval_hours").eq("is_active", true),
      supabase.from("vehicle_checklists").select("*").order("checked_at", { ascending: false }),
    ])

    const vehicles = vehiclesRes.data || []
    const checks = checklistsRes.data || []

    const vehicleMap = new Map<string, VehicleHealth>()
    for (const v of vehicles) {
      if (!v.plate_no) continue
      vehicleMap.set(v.plate_no, {
        vehicle_number: v.plate_no,
        display_name: v.display_name || '',
        total_checks: 0, total_issues: 0, pending_issues: 0, fixed_issues: 0, deferred_issues: 0,
        last_check: null, first_check: v.created_at, most_common_issue: null, issue_breakdown: {}, health_score: 100,
        days_in_service: v.created_at ? Math.ceil((Date.now() - new Date(v.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0,
        current_running_hours: v.current_running_hours || 0,
        last_running_hours_update: v.last_running_hours_update || null,
        next_service_hours: v.next_service_hours || null,
        service_interval_hours: v.service_interval_hours || 250,
      })
    }

    for (const c of checks) {
      const vn = c.vehicle_number
      if (!vn || !vehicleMap.has(vn)) continue
      const h = vehicleMap.get(vn)!
      h.total_checks++
      if (!h.last_check || new Date(c.checked_at) > new Date(h.last_check)) h.last_check = c.checked_at
      if (c.has_issues) {
        h.total_issues++
        if (c.resolution_status === "pending" || !c.resolution_status) h.pending_issues++
        else if (c.resolution_status === "fixed") h.fixed_issues++
        else if (c.resolution_status === "deferred") h.deferred_issues++
        if (c.issues) {
          for (const key of Object.keys(c.issues)) {
            h.issue_breakdown[key] = (h.issue_breakdown[key] || 0) + 1
          }
        }
      }
    }

    for (const h of vehicleMap.values()) {
      let maxCount = 0, mostCommon: string | null = null
      for (const [issue, count] of Object.entries(h.issue_breakdown)) {
        if (count > maxCount) { maxCount = count; mostCommon = issue }
      }
      h.most_common_issue = mostCommon
      const issueRate = h.total_checks > 0 ? (h.total_issues / h.total_checks) * 100 : 0
      h.health_score = Math.max(0, Math.min(100, Math.round(100 - issueRate * 2 - h.pending_issues * 10)))
    }

    setVehicleHealthData(Array.from(vehicleMap.values()))
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      timeZone: "Indian/Maldives", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true
    })
  }

  const formatDateOnly = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      timeZone: "Indian/Maldives", month: "short", day: "numeric", year: "numeric"
    })
  }

  const getFailedItems = (checklist: VehicleChecklist) => {
    if (!checklist.all_items) return []
    return Object.entries(checklist.all_items).filter(([, passed]) => !passed).map(([key]) => key)
  }

  const getHealthLabel = (score: number) => score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Poor"
  const getHealthColor = (score: number) => score >= 80 ? "text-green-500" : score >= 60 ? "text-yellow-500" : score >= 40 ? "text-orange-500" : "text-red-500"

  const handleSave = async () => {
    if (!editingChecklist) return
    setSaving(true)
    const { error } = await supabase.from("vehicle_checklists").update({
      driver_name: editingChecklist.driver_name, vehicle_number: editingChecklist.vehicle_number,
      has_issues: editingChecklist.has_issues, issues: editingChecklist.issues,
      all_items: editingChecklist.all_items, remarks: editingChecklist.remarks,
    }).eq("id", editingChecklist.id)

    if (error) toast.error("Failed to update")
    else {
      toast.success("Updated successfully")
      setChecklists(prev => prev.map(c => c.id === editingChecklist.id ? editingChecklist : c))
      setEditingChecklist(null)
    }
    setSaving(false)
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase.from("vehicle_checklists").delete().eq("id", deleteId)
    if (error) toast.error("Failed to delete")
    else {
      toast.success("Deleted successfully")
      setChecklists(prev => prev.filter(c => c.id !== deleteId))
    }
    setDeleteId(null)
  }

  const toggleIssuesStatus = async (checklist: VehicleChecklist) => {
    const newStatus = !checklist.has_issues
    const { error } = await supabase.from("vehicle_checklists").update({ has_issues: newStatus }).eq("id", checklist.id)
    if (error) toast.error("Failed to update status")
    else {
      toast.success(newStatus ? "Flagged as having issues" : "Cleared issues")
      setChecklists(prev => prev.map(c => c.id === checklist.id ? { ...c, has_issues: newStatus } : c))
    }
  }

  const toggleItemStatus = (key: string) => {
    if (!editingChecklist?.all_items) return
    const newItems = { ...editingChecklist.all_items, [key]: !editingChecklist.all_items[key] }
    const hasIssues = Object.values(newItems).some(v => !v)
    setEditingChecklist({ ...editingChecklist, all_items: newItems, has_issues: hasIssues })
  }

  const filteredChecklists = checklists.filter(c => {
    if (!search) return true
    const s = search.toLowerCase()
    return c.driver_name?.toLowerCase().includes(s) || c.vehicle_number?.toLowerCase().includes(s)
  })

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const idsToDelete = Array.from(selectedIds)
    setBulkDeleteOpen(false)
    const { error } = await supabase.from("vehicle_checklists").delete().in("id", idsToDelete)
    if (error) toast.error("Failed to delete selected checklists")
    else {
      toast.success(`${idsToDelete.length} checklist(s) deleted`)
      setSelectedIds(new Set())
      loadChecklists(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredChecklists.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filteredChecklists.map(c => c.id)))
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) newSelected.delete(id)
    else newSelected.add(id)
    setSelectedIds(newSelected)
  }

  const exportCSV = async (reportType: string) => {
    setGenerating(true)
    let rows: Record<string, string>[] = []
    let headers: string[] = []
    let filename = ""

    const filtered = allChecklists.filter(c => {
      const date = new Date(c.checked_at)
      return date >= new Date(startDate) && date <= new Date(endDate + "T23:59:59")
    })

    switch (reportType) {
      case "fleet-health":
        headers = ["Vehicle", "Health Score", "Status", "Days Active", "Total Checks", "Total Issues", "Pending", "Fixed", "Common Issue"]
        rows = vehicleHealthData.map(v => ({
          "Vehicle": v.vehicle_number, "Health Score": `${v.health_score}%`, "Status": getHealthLabel(v.health_score),
          "Days Active": String(v.days_in_service), "Total Checks": String(v.total_checks), "Total Issues": String(v.total_issues),
          "Pending": String(v.pending_issues), "Fixed": String(v.fixed_issues),
          "Common Issue": v.most_common_issue ? (ITEM_LABELS[v.most_common_issue] || v.most_common_issue) : "-",
        }))
        filename = `fleet_health_${new Date().toISOString().split("T")[0]}.csv`
        break
      case "all-issues":
        headers = ["Date", "Vehicle", "Driver", "Issues", "Status", "Resolution"]
        rows = filtered.filter(c => c.has_issues).map(c => ({
          "Date": formatDateOnly(c.checked_at), "Vehicle": c.vehicle_number || "-", "Driver": c.driver_name || "-",
          "Issues": c.issues ? Object.keys(c.issues).map(k => ITEM_LABELS[k] || k).join(", ") : "-",
          "Status": c.resolution_status || "Pending", "Resolution": c.resolution_notes || "-",
        }))
        filename = `all_issues_${new Date().toISOString().split("T")[0]}.csv`
        break
      case "vehicle-checks":
        headers = ["Date", "Vehicle", "Driver", "Status", "Issues"]
        rows = filtered.map(c => ({
          "Date": formatDateOnly(c.checked_at), "Vehicle": c.vehicle_number || "-", "Driver": c.driver_name || "-",
          "Status": c.has_issues ? "Issue" : "OK",
          "Issues": c.issues ? Object.keys(c.issues).map(k => ITEM_LABELS[k] || k).join(", ") : "-",
        }))
        filename = `vehicle_checks_${new Date().toISOString().split("T")[0]}.csv`
        break
      case "issue-breakdown":
        headers = ["Issue Type", "Occurrences", "Vehicles Affected"]
        const breakdown: Record<string, { count: number; vehicles: Set<string> }> = {}
        filtered.forEach(c => {
          if (c.issues) {
            Object.keys(c.issues).forEach(key => {
              if (!breakdown[key]) breakdown[key] = { count: 0, vehicles: new Set() }
              breakdown[key].count++
              breakdown[key].vehicles.add(c.vehicle_number)
            })
          }
        })
        rows = Object.entries(breakdown).map(([key, val]) => ({
          "Issue Type": ITEM_LABELS[key] || key, "Occurrences": String(val.count), "Vehicles Affected": String(val.vehicles.size),
        })).sort((a, b) => parseInt(b["Occurrences"]) - parseInt(a["Occurrences"]))
        filename = `issue_breakdown_${new Date().toISOString().split("T")[0]}.csv`
        break
      case "pending-issues":
        headers = ["Date", "Vehicle", "Driver", "Issues", "Status"]
        rows = filtered.filter(c => c.has_issues && (!c.resolution_status || c.resolution_status === "pending")).map(c => ({
          "Date": formatDateOnly(c.checked_at), "Vehicle": c.vehicle_number || "-", "Driver": c.driver_name || "-",
          "Issues": c.issues ? Object.keys(c.issues).map(k => ITEM_LABELS[k] || k).join(", ") : "-", "Status": "Pending",
        }))
        filename = `pending_issues_${new Date().toISOString().split("T")[0]}.csv`
        break
      case "resolved-issues":
        headers = ["Date", "Vehicle", "Driver", "Issues", "Resolution", "Resolved"]
        rows = filtered.filter(c => c.has_issues && c.resolution_status === "fixed").map(c => ({
          "Date": formatDateOnly(c.checked_at), "Vehicle": c.vehicle_number || "-", "Driver": c.driver_name || "-",
          "Issues": c.issues ? Object.keys(c.issues).map(k => ITEM_LABELS[k] || k).join(", ") : "-",
          "Resolution": c.resolution_notes || "-", "Resolved": c.resolved_at ? formatDateOnly(c.resolved_at) : "-",
        }))
        filename = `resolved_issues_${new Date().toISOString().split("T")[0]}.csv`
        break
      case "vehicle-lifespan":
        headers = ["Vehicle", "Days Active", "Health Score", "Issue Rate", "Recommendation"]
        rows = vehicleHealthData.map(v => ({
          "Vehicle": v.vehicle_number, "Days Active": String(v.days_in_service), "Health Score": `${v.health_score}%`,
          "Issue Rate": v.total_checks > 0 ? `${Math.round((v.total_issues / v.total_checks) * 100)}%` : "0%",
          "Recommendation": v.health_score < 40 ? "Consider Replacement" : "Keep",
        })).sort((a, b) => parseInt(a["Health Score"]) - parseInt(b["Health Score"]))
        filename = `vehicle_lifespan_${new Date().toISOString().split("T")[0]}.csv`
        break
      case "vehicle-history":
        headers = ["Date", "Vehicle", "Event", "Driver", "Details"]
        const historyRows: { date: string; vehicle: string; event: string; driver: string; details: string; ts: number }[] = []
        filtered.forEach(c => {
          historyRows.push({
            date: formatDateOnly(c.checked_at), vehicle: c.vehicle_number || "-",
            event: c.has_issues ? "Pre-trip Check (Issues)" : "Pre-trip Check (Passed)",
            driver: c.driver_name || "-",
            details: c.has_issues ? `Issues: ${Object.keys(c.issues || {}).map(k => ITEM_LABELS[k] || k).join(", ")}` : "All items passed",
            ts: new Date(c.checked_at).getTime(),
          })
          if (c.resolution_status === "fixed" && c.resolved_at) {
            historyRows.push({
              date: formatDateOnly(c.resolved_at), vehicle: c.vehicle_number || "-",
              event: "Issue Resolved", driver: "-", details: c.resolution_notes || "Fixed",
              ts: new Date(c.resolved_at).getTime(),
            })
          }
        })
        historyRows.sort((a, b) => b.ts - a.ts)
        rows = historyRows.map(h => ({ "Date": h.date, "Vehicle": h.vehicle, "Event": h.event, "Driver": h.driver, "Details": h.details }))
        filename = `vehicle_history_${new Date().toISOString().split("T")[0]}.csv`
        break
    }

    if (rows.length === 0) { toast.error("No data to export"); setGenerating(false); return }

    const csv = [headers.join(","), ...rows.map(r => headers.map(h => {
      const val = r[h] || ""
      return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val
    }).join(","))].join("\n")

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
    toast.success(`${rows.length} records exported`)
    setGenerating(false)
  }

  const exportPDF = async (reportType: string) => {
    setGenerating(true)
    const report = REPORT_TYPES.find(r => r.id === reportType)
    let rows: Record<string, string>[] = []
    let headers: string[] = []

    // Reuse CSV logic
    const filtered = allChecklists.filter(c => {
      const date = new Date(c.checked_at)
      return date >= new Date(startDate) && date <= new Date(endDate + "T23:59:59")
    })

    switch (reportType) {
      case "fleet-health":
        headers = ["Vehicle", "Health", "Status", "Checks", "Issues", "Pending", "Fixed"]
        rows = vehicleHealthData.map(v => ({
          "Vehicle": v.vehicle_number, "Health": `${v.health_score}%`, "Status": getHealthLabel(v.health_score),
          "Checks": String(v.total_checks), "Issues": String(v.total_issues),
          "Pending": String(v.pending_issues), "Fixed": String(v.fixed_issues),
        }))
        break
      case "all-issues":
      case "pending-issues":
      case "resolved-issues":
        headers = ["Date", "Vehicle", "Driver", "Issues", "Status"]
        let data = filtered.filter(c => c.has_issues)
        if (reportType === "pending-issues") data = data.filter(c => !c.resolution_status || c.resolution_status === "pending")
        if (reportType === "resolved-issues") data = data.filter(c => c.resolution_status === "fixed")
        rows = data.map(c => ({
          "Date": formatDateOnly(c.checked_at), "Vehicle": c.vehicle_number || "-", "Driver": c.driver_name || "-",
          "Issues": c.issues ? Object.keys(c.issues).map(k => ITEM_LABELS[k] || k).join(", ") : "-",
          "Status": c.resolution_status || "Pending",
        }))
        break
      case "vehicle-checks":
        headers = ["Date", "Vehicle", "Driver", "Status", "Issues"]
        rows = filtered.map(c => ({
          "Date": formatDateOnly(c.checked_at), "Vehicle": c.vehicle_number || "-", "Driver": c.driver_name || "-",
          "Status": c.has_issues ? "Issue" : "OK",
          "Issues": c.issues ? Object.keys(c.issues).map(k => ITEM_LABELS[k] || k).join(", ") : "-",
        }))
        break
      case "issue-breakdown":
        headers = ["Issue Type", "Occurrences", "Vehicles"]
        const breakdown: Record<string, { count: number; vehicles: Set<string> }> = {}
        filtered.forEach(c => {
          if (c.issues) Object.keys(c.issues).forEach(key => {
            if (!breakdown[key]) breakdown[key] = { count: 0, vehicles: new Set() }
            breakdown[key].count++; breakdown[key].vehicles.add(c.vehicle_number)
          })
        })
        rows = Object.entries(breakdown).map(([key, val]) => ({
          "Issue Type": ITEM_LABELS[key] || key, "Occurrences": String(val.count), "Vehicles": String(val.vehicles.size),
        }))
        break
      case "vehicle-lifespan":
        headers = ["Vehicle", "Days", "Health", "Issue Rate", "Recommendation"]
        rows = vehicleHealthData.map(v => ({
          "Vehicle": v.vehicle_number, "Days": String(v.days_in_service), "Health": `${v.health_score}%`,
          "Issue Rate": v.total_checks > 0 ? `${Math.round((v.total_issues / v.total_checks) * 100)}%` : "0%",
          "Recommendation": v.health_score < 40 ? "Replace" : "Keep",
        }))
        break
      case "vehicle-history":
        headers = ["Date", "Vehicle", "Event", "Driver", "Details"]
        const hist: { date: string; vehicle: string; event: string; driver: string; details: string; ts: number }[] = []
        filtered.forEach(c => {
          hist.push({ date: formatDateOnly(c.checked_at), vehicle: c.vehicle_number || "-", event: c.has_issues ? "Issues Found" : "Passed", driver: c.driver_name || "-", details: c.has_issues ? Object.keys(c.issues || {}).map(k => ITEM_LABELS[k] || k).join(", ") : "OK", ts: new Date(c.checked_at).getTime() })
        })
        hist.sort((a, b) => b.ts - a.ts)
        rows = hist.map(h => ({ "Date": h.date, "Vehicle": h.vehicle, "Event": h.event, "Driver": h.driver, "Details": h.details }))
        break
    }

    if (rows.length === 0) { toast.error("No data to export"); setGenerating(false); return }

    const doc = new jsPDF()
    doc.setFontSize(20); doc.setTextColor(245, 158, 11); doc.text("MyRide", 14, 20)
    doc.setFontSize(14); doc.setTextColor(0, 0, 0); doc.text(report?.name || "Report", 14, 30)
    doc.setFontSize(10); doc.setTextColor(100, 100, 100)
    doc.text(`Generated ${new Date().toLocaleString("en-US", { timeZone: "Indian/Maldives" })} • ${startDate} to ${endDate}`, 14, 38)
    doc.setDrawColor(245, 158, 11); doc.setLineWidth(0.5); doc.line(14, 42, 196, 42)

    autoTable(doc, {
      head: [headers], body: rows.map(r => headers.map(h => r[h] || "-")), startY: 48,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [248, 249, 250], textColor: [100, 100, 100], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 252, 252] },
    })

    doc.save(`${reportType}_${new Date().toISOString().split("T")[0]}.pdf`)
    toast.success(`PDF downloaded - ${rows.length} records`)
    setGenerating(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div><div className="w-40 h-8 bg-muted rounded animate-pulse" /><div className="w-56 h-4 bg-muted rounded animate-pulse mt-2" /></div>
        <div className="grid gap-4 grid-cols-3">{[1, 2, 3].map(i => <SkeletonCard key={i} />)}</div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <PermissionGate permission="pretrip:view">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="h-6 w-6" />Pre-trip Checks</h1>
          <p className="text-sm text-muted-foreground">Vehicle inspections, fleet health & reports</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadData(false)}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 grid-cols-3">
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20 shrink-0"><ClipboardCheck className="h-4 w-4 text-slate-400" /></div>
            <div className="min-w-0"><p className="text-xl font-bold tracking-tight">{stats.total}</p><p className="text-xs text-muted-foreground truncate">Total</p></div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 shrink-0"><AlertTriangle className="h-4 w-4 text-red-500" /></div>
            <div className="min-w-0"><p className="text-xl font-bold tracking-tight text-red-500">{stats.withIssues}</p><p className="text-xs text-muted-foreground truncate">With Issues</p></div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0"><CheckCircle className="h-4 w-4 text-green-500" /></div>
            <div className="min-w-0"><p className="text-xl font-bold tracking-tight text-green-500">{stats.passed}</p><p className="text-xs text-muted-foreground truncate">Passed</p></div>
            <span className="text-xs font-medium text-green-500 ml-auto shrink-0">{stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0}%</span>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            activeTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}>
            <tab.icon className="h-4 w-4" />{tab.label}
          </button>
        ))}
      </div>

      {/* CHECKS TAB */}
      {activeTab === "checks" && (
        <>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg border">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}><X className="h-4 w-4 mr-1" />Clear</Button>
              <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}><Trash2 className="h-4 w-4 mr-1" />Delete Selected</Button>
            </div>
          )}

          <Card className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search driver or vehicle..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={filter} onValueChange={(v) => { setFilter(v); setCurrentPage(1) }}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="issues">With Issues</SelectItem>
                  <SelectItem value="passed">Passed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"><Checkbox checked={filteredChecklists.length > 0 && selectedIds.size === filteredChecklists.length} onCheckedChange={toggleSelectAll} /></TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Failed Items</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChecklists.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{search ? "No matching checklists" : "No checklists found"}</TableCell></TableRow>
                ) : (
                  filteredChecklists.map(checklist => {
                    const failedItems = getFailedItems(checklist)
                    return (
                      <TableRow key={checklist.id} className={`group hover:bg-muted/50 transition-colors ${checklist.has_issues ? "bg-red-50 dark:bg-red-950/20" : ""} ${selectedIds.has(checklist.id) ? 'bg-muted/50' : ''}`}>
                        <TableCell><Checkbox checked={selectedIds.has(checklist.id)} onCheckedChange={() => toggleSelect(checklist.id)} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8"><AvatarFallback>{checklist.driver_name?.[0] || "?"}</AvatarFallback></Avatar>
                            <span className="font-medium text-sm">{checklist.driver_name}</span>
                          </div>
                        </TableCell>
                        <TableCell><div className="flex items-center gap-1 text-sm"><Car className="h-4 w-4 text-muted-foreground" />{checklist.vehicle_number}</div></TableCell>
                        <TableCell><Badge className={checklist.has_issues ? "bg-red-500" : "bg-green-500"}>{checklist.has_issues ? "Issues" : "Passed"}</Badge></TableCell>
                        <TableCell>
                          {failedItems.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {failedItems.slice(0, 2).map(item => (<Badge key={item} variant="outline" className="text-xs text-red-500 border-red-300">{ITEM_LABELS[item] || item}</Badge>))}
                              {failedItems.length > 2 && <Badge variant="outline" className="text-xs">+{failedItems.length - 2}</Badge>}
                            </div>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(checklist.checked_at)}</TableCell>
                        <TableCell>
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setSelectedChecklist(checklist)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setEditingChecklist(checklist)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => toggleIssuesStatus(checklist)}>
                                <Flag className="h-4 w-4 mr-2" />
                                {checklist.has_issues ? "Clear Issues" : "Flag Issues"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteId(checklist.id)}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>

            {totalCount > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-4 border-t mt-4">
                <p className="text-sm text-muted-foreground">Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
                  <span className="text-sm text-muted-foreground">Page {currentPage} of {Math.ceil(totalCount / PAGE_SIZE)}</span>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / PAGE_SIZE), p + 1))} disabled={currentPage >= Math.ceil(totalCount / PAGE_SIZE)}>Next</Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* MANAGE ITEMS TAB */}
      {activeTab === "items" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Checklist Categories & Items</h3>
              <p className="text-sm text-muted-foreground">Manage pre-trip inspection items shown to drivers</p>
            </div>
            <Button onClick={openAddCategory}>
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Add Category
            </Button>
          </div>

          {itemsLoading ? (
            <div className="space-y-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : categories.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No checklist categories yet</p>
              <Button variant="outline" className="mt-4" onClick={openAddCategory}>Add First Category</Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {categories.map((cat) => (
                <Card key={cat.id} className={cn("p-4", !cat.is_active && "opacity-60")}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const IconComponent = ICON_MAP[cat.icon] || ClipboardCheck
                        return (
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <IconComponent className="h-5 w-5 text-primary" />
                          </div>
                        )
                      })()}
                      <div>
                        <h4 className="font-semibold flex items-center gap-2">
                          {cat.name}
                          {!cat.is_active && <Badge variant="secondary">Inactive</Badge>}
                        </h4>
                        <p className="text-sm text-muted-foreground">{cat.items?.length || 0} items</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => openAddItem(cat.id)}>
                        Add Item
                      </Button>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openEditCategory(cat)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => toggleCategoryActive(cat)}>
                            {cat.is_active ? <XCircle className="h-4 w-4 mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                            {cat.is_active ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600" onSelect={() => setDeleteCategoryId(cat.id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {cat.items && cat.items.length > 0 ? (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, cat.id)}>
                      <SortableContext items={cat.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2 ml-4 border-l-2 border-muted pl-4">
                          {cat.items.map((item) => (
                            <SortableItem
                              key={item.id}
                              item={item}
                              openEditItem={openEditItem}
                              toggleItemActive={toggleItemActive}
                              setDeleteItemId={setDeleteItemId}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <p className="text-sm text-muted-foreground ml-4 italic">No items in this category</p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FLEET HEALTH TAB */}
      {activeTab === "fleet" && (
        <Card className="p-4">
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Running Hrs</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Checks</TableHead>
                  <TableHead>Issues</TableHead>
                  <TableHead>Next Service</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicleHealthData.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No vehicles found</TableCell></TableRow>
                ) : (
                  vehicleHealthData.map(v => {
                    const hoursToService = v.next_service_hours ? v.next_service_hours - v.current_running_hours : v.service_interval_hours - (v.current_running_hours % v.service_interval_hours)
                    const serviceOverdue = hoursToService <= 0
                    const serviceSoon = hoursToService > 0 && hoursToService <= 50
                    return (
                      <TableRow key={v.vehicle_number} className="hover:bg-muted/30 cursor-pointer group" onClick={() => setSelectedVehicle(v.vehicle_number)}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                {v.vehicle_number}
                                <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                              {v.display_name && <p className="text-xs text-muted-foreground">{v.display_name}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{v.current_running_hours.toFixed(1)}</span>
                            <span className="text-muted-foreground text-xs">hrs</span>
                          </div>
                        </TableCell>
                        <TableCell className={cn("font-bold", getHealthColor(v.health_score))}>{v.health_score}%</TableCell>
                        <TableCell><Badge variant={v.health_score >= 80 ? "default" : v.health_score >= 60 ? "secondary" : "destructive"}>{getHealthLabel(v.health_score)}</Badge></TableCell>
                        <TableCell>{v.total_checks}</TableCell>
                        <TableCell className="text-orange-500">{v.total_issues}</TableCell>
                        <TableCell>
                          {serviceOverdue ? (
                            <Badge variant="destructive" className="text-xs">Overdue</Badge>
                          ) : serviceSoon ? (
                            <Badge variant="secondary" className="text-xs bg-yellow-500/20 text-yellow-500">{Math.round(hoursToService)} hrs</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">{Math.round(hoursToService)} hrs</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* REPORTS TAB */}
      {activeTab === "reports" && (() => {
        const filtered = allChecklists.filter(c => {
          const date = new Date(c.checked_at)
          return date >= new Date(startDate) && date <= new Date(endDate + "T23:59:59")
        })
        const totalChecks = filtered.length
        const issuesFound = filtered.filter(c => c.has_issues).length
        const pendingCount = filtered.filter(c => c.has_issues && (!c.resolution_status || c.resolution_status === "pending")).length
        const resolvedCount = filtered.filter(c => c.has_issues && c.resolution_status === "fixed").length
        const resolutionRate = issuesFound > 0 ? Math.round((resolvedCount / issuesFound) * 100) : 100
        const activeVehicles = vehicleHealthData.length
        const avgHealth = vehicleHealthData.length > 0 ? Math.round(vehicleHealthData.reduce((a, v) => a + v.health_score, 0) / vehicleHealthData.length) : 0

        const setDatePreset = (preset: string) => {
          const today = new Date()
          let start = new Date()
          switch (preset) {
            case "7days": start.setDate(today.getDate() - 7); break
            case "month": start = new Date(today.getFullYear(), today.getMonth(), 1); break
            case "lastMonth": start = new Date(today.getFullYear(), today.getMonth() - 1, 1); today.setDate(0); break
            case "all": start = new Date(2020, 0, 1); break
          }
          setStartDate(start.toISOString().split("T")[0])
          setEndDate(preset === "lastMonth" ? today.toISOString().split("T")[0] : new Date(Date.now() + 86400000).toISOString().split("T")[0])
        }

        const reportStats: Record<string, { count: number; label: string; color: string }> = {
          "fleet-health": { count: avgHealth, label: `${avgHealth}% avg health`, color: avgHealth >= 80 ? "text-green-500" : avgHealth >= 60 ? "text-yellow-500" : "text-red-500" },
          "all-issues": { count: issuesFound, label: `${issuesFound} issues`, color: issuesFound > 0 ? "text-orange-500" : "text-green-500" },
          "vehicle-checks": { count: totalChecks, label: `${totalChecks} inspections`, color: "text-blue-500" },
          "issue-breakdown": { count: Object.keys(filtered.reduce((acc, c) => { if (c.issues) Object.keys(c.issues).forEach(k => acc[k] = true); return acc }, {} as Record<string, boolean>)).length, label: "issue types", color: "text-purple-500" },
          "pending-issues": { count: pendingCount, label: `${pendingCount} pending`, color: pendingCount > 0 ? "text-yellow-500" : "text-green-500" },
          "resolved-issues": { count: resolvedCount, label: `${resolvedCount} resolved`, color: "text-green-500" },
          "vehicle-lifespan": { count: vehicleHealthData.length, label: `${vehicleHealthData.length} vehicles`, color: "text-blue-500" },
          "vehicle-history": { count: filtered.length, label: `${filtered.length} events`, color: "text-slate-400" },
        }

        const REPORT_CATEGORIES = [
          { title: "Health & Performance", ids: ["fleet-health", "vehicle-lifespan"] },
          { title: "Issues & Resolutions", ids: ["all-issues", "pending-issues", "resolved-issues", "issue-breakdown"] },
          { title: "History & Records", ids: ["vehicle-checks", "vehicle-history"] },
        ]

        return (
          <div className="space-y-6">
            {/* Quick Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="h-5 w-5 text-blue-500" />
                  <div><p className="text-2xl font-bold text-blue-500">{totalChecks}</p><p className="text-xs text-muted-foreground">Total Checks</p></div>
                </div>
              </Card>
              <Card className={cn("p-4 bg-gradient-to-br border-orange-500/20", issuesFound > 0 ? "from-orange-500/10 to-orange-600/5" : "from-green-500/10 to-green-600/5")}>
                <div className="flex items-center gap-3">
                  <AlertTriangle className={cn("h-5 w-5", issuesFound > 0 ? "text-orange-500" : "text-green-500")} />
                  <div><p className={cn("text-2xl font-bold", issuesFound > 0 ? "text-orange-500" : "text-green-500")}>{issuesFound}</p><p className="text-xs text-muted-foreground">Issues Found</p></div>
                </div>
              </Card>
              <Card className={cn("p-4 bg-gradient-to-br border-green-500/20", resolutionRate >= 80 ? "from-green-500/10 to-green-600/5" : "from-yellow-500/10 to-yellow-600/5")}>
                <div className="flex items-center gap-3">
                  <CheckCircle className={cn("h-5 w-5", resolutionRate >= 80 ? "text-green-500" : "text-yellow-500")} />
                  <div><p className={cn("text-2xl font-bold", resolutionRate >= 80 ? "text-green-500" : "text-yellow-500")}>{resolutionRate}%</p><p className="text-xs text-muted-foreground">Resolved</p></div>
                </div>
              </Card>
              <Card className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                <div className="flex items-center gap-3">
                  <Car className="h-5 w-5 text-purple-500" />
                  <div><p className="text-2xl font-bold text-purple-500">{activeVehicles}</p><p className="text-xs text-muted-foreground">Active Vehicles</p></div>
                </div>
              </Card>
              <Card className={cn("p-4 bg-gradient-to-br border-emerald-500/20", avgHealth >= 80 ? "from-emerald-500/10 to-emerald-600/5" : avgHealth >= 60 ? "from-yellow-500/10 to-yellow-600/5" : "from-red-500/10 to-red-600/5")}>
                <div className="flex items-center gap-3">
                  <Activity className={cn("h-5 w-5", avgHealth >= 80 ? "text-emerald-500" : avgHealth >= 60 ? "text-yellow-500" : "text-red-500")} />
                  <div><p className={cn("text-2xl font-bold", avgHealth >= 80 ? "text-emerald-500" : avgHealth >= 60 ? "text-yellow-500" : "text-red-500")}>{avgHealth}%</p><p className="text-xs text-muted-foreground">Fleet Health</p></div>
                </div>
              </Card>
            </div>

            {/* Date Filter */}
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">Period:</span>
                <div className="flex gap-2">
                  {[{ id: "7days", label: "Last 7 Days" }, { id: "month", label: "This Month" }, { id: "lastMonth", label: "Last Month" }, { id: "all", label: "All Time" }].map(p => (
                    <Button key={p.id} size="sm" variant="outline" onClick={() => setDatePreset(p.id)} className="text-xs">{p.label}</Button>
                  ))}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36 h-8 px-2 rounded-md border border-input bg-background text-xs [color-scheme:dark]" />
                  <span className="text-muted-foreground text-sm">to</span>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36 h-8 px-2 rounded-md border border-input bg-background text-xs [color-scheme:dark]" />
                </div>
              </div>
            </Card>

            {/* Report Categories */}
            {REPORT_CATEGORIES.map(category => (
              <div key={category.title} className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{category.title}</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {REPORT_TYPES.filter(r => category.ids.includes(r.id)).map(report => {
                    const stat = reportStats[report.id]
                    return (
                      <Card key={report.id} className="p-5 hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 group">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                              <report.icon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h4 className="font-semibold">{report.name}</h4>
                              <p className={cn("text-sm font-medium", stat?.color || "text-muted-foreground")}>{stat?.label}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1 h-9 border-green-500/30 text-green-500 hover:bg-green-500/10 hover:border-green-500/50" onClick={() => exportCSV(report.id)} disabled={generating}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />Export CSV
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 h-9 border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50" onClick={() => exportPDF(report.id)} disabled={generating}>
                            <FileDown className="h-4 w-4 mr-2" />Export PDF
                          </Button>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* View Details Dialog */}
      <Dialog open={!!selectedChecklist} onOpenChange={() => setSelectedChecklist(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Checklist Details</DialogTitle></DialogHeader>
          {selectedChecklist && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted rounded-lg text-sm">
                <div><span className="text-muted-foreground">Driver:</span> {selectedChecklist.driver_name}</div>
                <div><span className="text-muted-foreground">Vehicle:</span> {selectedChecklist.vehicle_number}</div>
                <div><span className="text-muted-foreground">Date:</span> {formatDate(selectedChecklist.checked_at)}</div>
                <div><Badge className={selectedChecklist.has_issues ? "bg-red-500" : "bg-green-500"}>{selectedChecklist.has_issues ? "Issues Found" : "Passed"}</Badge></div>
              </div>
              {selectedChecklist.has_issues && selectedChecklist.issues && (
                <div className="p-3 border border-red-200 rounded-lg bg-red-50 dark:bg-red-950/20">
                  <h3 className="font-medium text-red-600 mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Issues</h3>
                  <div className="space-y-2">
                    {Object.entries(selectedChecklist.issues).map(([key, value]) => {
                      const isDetail = typeof value === "object" && value !== null
                      const note = isDetail ? (value as IssueDetail).note : value as string
                      const photos = isDetail ? (value as IssueDetail).photos : undefined
                      return (
                        <div key={key} className="p-2 bg-background rounded border text-sm">
                          <p className="font-medium text-red-600">{ITEM_LABELS[key] || key}</p>
                          <p className="text-muted-foreground">{note}</p>
                          {photos && photos.length > 0 && (
                            <div className="flex gap-2 mt-2">
                              {photos.map((photo, i) => (
                                <a key={i} href={photo} target="_blank" rel="noopener noreferrer" className="relative group">
                                  <img src={photo} alt="" className="h-16 w-16 object-cover rounded border" />
                                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded"><Download className="h-4 w-4 text-white" /></span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {selectedChecklist.all_items && (
                <div className="p-3 border rounded-lg">
                  <h3 className="font-medium mb-2">All Items</h3>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(selectedChecklist.all_items).map(([key, passed]) => (
                      <div key={key} className={`flex items-center gap-2 p-1.5 rounded text-sm ${passed ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}`}>
                        {passed ? <CheckCircle className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                        {ITEM_LABELS[key] || key}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedChecklist.remarks && (
                <div className="p-3 border rounded-lg bg-muted/30">
                  <h3 className="font-medium mb-2">Admin Remarks</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedChecklist.remarks}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingChecklist} onOpenChange={() => setEditingChecklist(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Checklist</DialogTitle></DialogHeader>
          {editingChecklist && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">Driver Name</label><Input value={editingChecklist.driver_name} onChange={e => setEditingChecklist({ ...editingChecklist, driver_name: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Vehicle Number</label><Input value={editingChecklist.vehicle_number} onChange={e => setEditingChecklist({ ...editingChecklist, vehicle_number: e.target.value })} /></div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Checklist Items (click to toggle)</label>
                <div className="grid grid-cols-2 gap-2">
                  {editingChecklist.all_items && Object.entries(editingChecklist.all_items).map(([key, passed]) => (
                    <button key={key} type="button" onClick={() => toggleItemStatus(key)} className={`flex items-center gap-2 p-2 rounded border text-sm text-left transition-colors ${passed ? "bg-green-50 border-green-200 dark:bg-green-950/20" : "bg-red-50 border-red-200 dark:bg-red-950/20"}`}>
                      {passed ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                      {ITEM_LABELS[key] || key}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Admin Remarks</label>
                <textarea className="w-full min-h-[80px] p-3 rounded-md border bg-background text-sm resize-none" placeholder="Add comments..." value={editingChecklist?.remarks || ""} onChange={(e) => setEditingChecklist(prev => prev ? { ...prev, remarks: e.target.value } : null)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingChecklist(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vehicle History Dialog */}
      <Dialog open={!!selectedVehicle} onOpenChange={() => setSelectedVehicle(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Car className="h-5 w-5" />Vehicle History: {selectedVehicle}</DialogTitle></DialogHeader>
          {selectedVehicle && (() => {
            const vehicleHealth = vehicleHealthData.find(v => v.vehicle_number === selectedVehicle)
            const vehicleChecklists = allChecklists.filter(c => c.vehicle_number === selectedVehicle)
            return (
              <div className="flex-1 overflow-y-auto space-y-4">
                {vehicleHealth && (
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50 text-center"><p className={cn("text-2xl font-bold", getHealthColor(vehicleHealth.health_score))}>{vehicleHealth.health_score}%</p><p className="text-xs text-muted-foreground">Health Score</p></div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center"><p className="text-2xl font-bold">{vehicleHealth.total_checks}</p><p className="text-xs text-muted-foreground">Total Checks</p></div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center"><p className="text-2xl font-bold text-orange-500">{vehicleHealth.total_issues}</p><p className="text-xs text-muted-foreground">Total Issues</p></div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center"><p className="text-2xl font-bold text-yellow-500">{vehicleHealth.pending_issues}</p><p className="text-xs text-muted-foreground">Pending</p></div>
                  </div>
                )}
                {vehicleHealth && Object.keys(vehicleHealth.issue_breakdown).length > 0 && (
                  <div className="p-4 rounded-lg border">
                    <h3 className="font-medium mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4" />Issue Breakdown</h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(vehicleHealth.issue_breakdown).sort(([, a], [, b]) => b - a).map(([issue, count]) => (
                        <Badge key={issue} variant="outline" className="text-sm">{ITEM_LABELS[issue] || issue}: {count}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="rounded-lg border overflow-hidden">
                  <div className="px-4 py-3 bg-muted/50 border-b"><h3 className="font-medium flex items-center gap-2"><ClipboardCheck className="h-4 w-4" />Pre-trip Check History ({vehicleChecklists.length})</h3></div>
                  <div className="max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted/30">
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Driver</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Issues</TableHead>
                          <TableHead className="text-xs">Resolution</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vehicleChecklists.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No pre-trip checks recorded</TableCell></TableRow>
                        ) : (
                          vehicleChecklists.map(check => (
                            <TableRow key={check.id} className={check.has_issues ? "bg-red-500/5" : ""}>
                              <TableCell className="text-sm">{formatDate(check.checked_at)}</TableCell>
                              <TableCell className="text-sm">{check.driver_name}</TableCell>
                              <TableCell><Badge className={cn("text-xs", check.has_issues ? "bg-red-500" : "bg-green-500")}>{check.has_issues ? "Issue" : "OK"}</Badge></TableCell>
                              <TableCell className="text-sm text-muted-foreground">{check.issues ? Object.keys(check.issues).map(k => ITEM_LABELS[k] || k).join(", ") : "-"}</TableCell>
                              <TableCell>{check.has_issues && <Badge variant={check.resolution_status === "fixed" ? "default" : "secondary"} className="text-xs">{check.resolution_status || "Pending"}</Badge>}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {selectedIds.size} Checklist(s)?</AlertDialogTitle><AlertDialogDescription>This will permanently delete {selectedIds.size} selected checklist(s). This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleBulkDelete} className="bg-red-500 hover:bg-red-600">Delete All</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Checklist?</AlertDialogTitle><AlertDialogDescription>This will permanently delete this checklist record. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Category Name *</label>
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="e.g., Exterior, Interior, Safety"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Icon</label>
              <Select value={categoryForm.icon} onValueChange={(v) => setCategoryForm({ ...categoryForm, icon: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent position="popper" className="z-[200]">
                  <SelectItem value="car">Car / Exterior</SelectItem>
                  <SelectItem value="armchair">Interior</SelectItem>
                  <SelectItem value="shield-check">Safety</SelectItem>
                  <SelectItem value="clipboard">Clipboard</SelectItem>
                  <SelectItem value="wrench">Maintenance</SelectItem>
                  <SelectItem value="settings">Settings</SelectItem>
                  <SelectItem value="gauge">Engine / Fluids</SelectItem>
                  <SelectItem value="zap">Electrical</SelectItem>
                  <SelectItem value="disc">Tires / Wheels</SelectItem>
                  <SelectItem value="sun">Lights</SelectItem>
                  <SelectItem value="wind">HVAC / Climate</SelectItem>
                  <SelectItem value="droplet">Fluids</SelectItem>
                  <SelectItem value="file-text">Documents</SelectItem>
                  <SelectItem value="alert-triangle">Warning</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveCategory} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingCategory ? "Save Changes" : "Add Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Checklist Item" : "Add Checklist Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title *</label>
              <Input
                value={itemForm.title}
                onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                placeholder="e.g., Tires & Wheels"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Key * <span className="text-muted-foreground">(unique identifier)</span></label>
              <Input
                value={itemForm.key}
                onChange={(e) => setItemForm({ ...itemForm, key: e.target.value })}
                placeholder="e.g., tires"
                disabled={!!editingItem}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="e.g., Properly inflated, good tread depth"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Icon</label>
              <Select value={itemForm.icon} onValueChange={(v) => setItemForm({ ...itemForm, icon: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent position="popper" className="z-[200]">
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="circle-dot">Tire / Wheel</SelectItem>
                  <SelectItem value="lightbulb">Headlights</SelectItem>
                  <SelectItem value="car">Body / Exterior</SelectItem>
                  <SelectItem value="sparkles">Cleanliness</SelectItem>
                  <SelectItem value="thermometer">A/C / Climate</SelectItem>
                  <SelectItem value="shield">Seatbelt / Safety</SelectItem>
                  <SelectItem value="fuel">Fuel Level</SelectItem>
                  <SelectItem value="file-text">Documents</SelectItem>
                  <SelectItem value="heart">First Aid Kit</SelectItem>
                  <SelectItem value="gauge">Engine / Fluids</SelectItem>
                  <SelectItem value="zap">Battery / Electrical</SelectItem>
                  <SelectItem value="disc">Brakes</SelectItem>
                  <SelectItem value="eye">Mirrors / Visibility</SelectItem>
                  <SelectItem value="volume-2">Horn / Signals</SelectItem>
                  <SelectItem value="lock">Doors / Locks</SelectItem>
                  <SelectItem value="droplet">Oil / Fluids</SelectItem>
                  <SelectItem value="wind">Wipers / Windshield</SelectItem>
                  <SelectItem value="alert-triangle">Warning Lights</SelectItem>
                  <SelectItem value="package">Emergency Kit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveItem} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingItem ? "Save Changes" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Category Confirmation */}
      <AlertDialog open={!!deleteCategoryId} onOpenChange={(open) => { if (!open) setDeleteCategoryId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category?</AlertDialogTitle>
            <AlertDialogDescription>This will delete the category and all its items. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteCategory} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Item Confirmation */}
      <AlertDialog open={!!deleteItemId} onOpenChange={(open) => { if (!open) setDeleteItemId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item?</AlertDialogTitle>
            <AlertDialogDescription>This will delete the checklist item. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteItem} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </PermissionGate>
  )
}
