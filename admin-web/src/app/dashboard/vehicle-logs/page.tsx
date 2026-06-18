"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Fuel, Loader2, MoreVertical, Edit, Trash2, Plus, Wrench, Sparkles, Car, Filter } from "lucide-react"
import { toast } from "sonner"

interface VehicleLog {
  id: string
  driver_id: string
  log_type: string
  amount: number | null
  odometer: number | null
  notes: string | null
  log_date: string
  created_at: string
  driver?: {
    profile?: {
      full_name: string
    }
  }
}

const LOG_TYPES = [
  { value: "fuel", label: "Fuel", icon: Fuel, color: "bg-orange-500" },
  { value: "maintenance", label: "Maintenance", icon: Wrench, color: "bg-blue-500" },
  { value: "repair", label: "Repair", icon: Wrench, color: "bg-red-500" },
  { value: "cleaning", label: "Cleaning", icon: Sparkles, color: "bg-green-500" },
  { value: "inspection", label: "Inspection", icon: Car, color: "bg-purple-500" },
]

export default function VehicleLogsPage() {
  const supabase = createClient()
  const [logs, setLogs] = useState<VehicleLog[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedLog, setSelectedLog] = useState<VehicleLog | null>(null)
  const [saving, setSaving] = useState(false)
  const [filterType, setFilterType] = useState("all")

  const [formData, setFormData] = useState({
    log_type: "fuel",
    amount: "",
    odometer: "",
    notes: "",
    log_date: new Date().toISOString().split("T")[0],
  })

  useEffect(() => {
    loadLogs()
  }, [filterType])

  const loadLogs = async () => {
    setLoading(true)
    let query = supabase
      .from("vehicle_logs")
      .select(`
        *,
        driver:drivers!vehicle_logs_driver_id_fkey(
          profile:profiles(full_name)
        )
      `)
      .order("log_date", { ascending: false })

    if (filterType !== "all") {
      query = query.eq("log_type", filterType)
    }

    const { data } = await query
    setLogs(data || [])
    setLoading(false)
  }

  const openDialog = (log?: VehicleLog) => {
    if (log) {
      setSelectedLog(log)
      setFormData({
        log_type: log.log_type,
        amount: log.amount?.toString() || "",
        odometer: log.odometer?.toString() || "",
        notes: log.notes || "",
        log_date: log.log_date,
      })
    } else {
      setSelectedLog(null)
      setFormData({
        log_type: "fuel",
        amount: "",
        odometer: "",
        notes: "",
        log_date: new Date().toISOString().split("T")[0],
      })
    }
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)

    const payload = {
      log_type: formData.log_type,
      amount: formData.amount ? parseFloat(formData.amount) : null,
      odometer: formData.odometer ? parseInt(formData.odometer) : null,
      notes: formData.notes || null,
      log_date: formData.log_date,
    }

    if (selectedLog) {
      const { error } = await supabase
        .from("vehicle_logs")
        .update(payload)
        .eq("id", selectedLog.id)

      if (error) {
        toast.error("Failed to update log")
      } else {
        toast.success("Log updated")
        setLogs(prev => prev.map(l => l.id === selectedLog.id ? { ...l, ...payload } : l))
      }
    }

    setSaving(false)
    setDialogOpen(false)
  }

  const handleDelete = async () => {
    if (!selectedLog) return

    const { error } = await supabase
      .from("vehicle_logs")
      .delete()
      .eq("id", selectedLog.id)

    if (error) {
      toast.error("Failed to delete log")
    } else {
      toast.success("Log deleted")
      setLogs(prev => prev.filter(l => l.id !== selectedLog.id))
    }

    setDeleteDialogOpen(false)
    setSelectedLog(null)
  }

  const confirmDelete = (log: VehicleLog) => {
    setSelectedLog(log)
    setDeleteDialogOpen(true)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatAmount = (amount: number | null) => {
    if (!amount) return "-"
    return `MVR ${amount.toFixed(2)}`
  }

  const getLogTypeInfo = (type: string) => {
    return LOG_TYPES.find(t => t.value === type) || LOG_TYPES[0]
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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Fuel className="h-6 w-6" />
            Vehicle Logs
          </h1>
          <p className="text-sm text-muted-foreground">Fuel, maintenance, and repair records</p>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {LOG_TYPES.map(type => (
                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{logs.length} records</span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Odometer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No vehicle logs found
                </TableCell>
              </TableRow>
            ) : (
              logs.map(log => {
                const typeInfo = getLogTypeInfo(log.log_type)
                const Icon = typeInfo.icon
                return (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded ${typeInfo.color}`}>
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <span className="capitalize">{log.log_type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {log.driver?.profile?.full_name || "-"}
                    </TableCell>
                    <TableCell>{formatAmount(log.amount)}</TableCell>
                    <TableCell>
                      {log.odometer ? `${log.odometer.toLocaleString()} km` : "-"}
                    </TableCell>
                    <TableCell>{formatDate(log.log_date)}</TableCell>
                    <TableCell className="max-w-48 truncate">
                      {log.notes || "-"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openDialog(log)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500"
                            onClick={() => confirmDelete(log)}
                          >
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
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Vehicle Log</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select value={formData.log_type} onValueChange={v => setFormData(p => ({ ...p, log_type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOG_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Amount (MVR)</label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={e => setFormData(p => ({ ...p, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Odometer (km)</label>
              <Input
                type="number"
                value={formData.odometer}
                onChange={e => setFormData(p => ({ ...p, odometer: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={formData.log_date}
                onChange={e => setFormData(p => ({ ...p, log_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={formData.notes}
                onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Log</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this vehicle log? This action cannot be undone.
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
  )
}
