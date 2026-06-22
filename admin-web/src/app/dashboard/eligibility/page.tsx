"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Plus, Edit, Trash2, MoreHorizontal, Loader2, Zap, Calendar, Clock, Download } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { toast } from "sonner"
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-card"
import { EmptyState } from "@/components/ui/empty-state"

interface Campaign {
  id: string
  name: string
  max_rides_per_day: number | null
  max_rides_per_week: number | null
  allowed_start_time: string | null
  allowed_end_time: string | null
  target_roles: string[] | null
  is_active: boolean
  created_at: string
}

export default function EligibilityPage() {
  const supabase = createClient()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogType, setDialogType] = useState<"add" | "edit" | "delete" | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    max_rides_per_day: "",
    max_rides_per_week: "",
    allowed_start_time: "",
    allowed_end_time: "",
    target_roles: "all",
    is_active: true
  })

  useEffect(() => {
    loadCampaigns()

    const channel = supabase
      .channel('eligibility_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_campaigns' }, () => {
        loadCampaigns()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadCampaigns = async () => {
    const { data } = await supabase
      .from("ride_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
    setCampaigns(data || [])
    setLoading(false)
  }

  const openAddDialog = () => {
    setSelectedCampaign(null)
    setFormData({
      name: "",
      max_rides_per_day: "",
      max_rides_per_week: "",
      allowed_start_time: "",
      allowed_end_time: "",
      target_roles: "all",
      is_active: true
    })
    setDialogType("add")
  }

  const openEditDialog = (campaign: Campaign) => {
    setSelectedCampaign(campaign)
    setFormData({
      name: campaign.name,
      max_rides_per_day: campaign.max_rides_per_day?.toString() || "",
      max_rides_per_week: campaign.max_rides_per_week?.toString() || "",
      allowed_start_time: campaign.allowed_start_time || "",
      allowed_end_time: campaign.allowed_end_time || "",
      target_roles: campaign.target_roles?.[0] || "all",
      is_active: campaign.is_active
    })
    setDialogType("edit")
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Campaign name is required")
      return
    }
    setSaving(true)

    const payload = {
      name: formData.name,
      max_rides_per_day: formData.max_rides_per_day ? parseInt(formData.max_rides_per_day) : null,
      max_rides_per_week: formData.max_rides_per_week ? parseInt(formData.max_rides_per_week) : null,
      allowed_start_time: formData.allowed_start_time || null,
      allowed_end_time: formData.allowed_end_time || null,
      target_roles: formData.target_roles === "all" ? null : [formData.target_roles],
      is_active: formData.is_active
    }

    if (dialogType === "edit" && selectedCampaign) {
      const { error } = await supabase
        .from("ride_campaigns")
        .update(payload)
        .eq("id", selectedCampaign.id)

      if (error) toast.error("Failed to update campaign")
      else {
        toast.success("Campaign updated")
        loadCampaigns()
      }
    } else {
      const { error } = await supabase
        .from("ride_campaigns")
        .insert(payload)

      if (error) toast.error("Failed to create campaign: " + error.message)
      else {
        toast.success("Campaign created")
        loadCampaigns()
      }
    }
    setSaving(false)
    setDialogType(null)
  }

  const handleDelete = async (e?: React.MouseEvent) => {
    e?.preventDefault()
    if (!selectedCampaign) return
    const campaignToDelete = selectedCampaign
    setDialogType(null)
    setSaving(true)

    const { error } = await supabase
      .from("ride_campaigns")
      .delete()
      .eq("id", campaignToDelete.id)

    if (error) toast.error("Failed to delete campaign")
    else {
      toast.success("Campaign deleted")
      loadCampaigns()
    }
    setSaving(false)
  }

  const toggleActive = async (campaign: Campaign) => {
    const { error } = await supabase
      .from("ride_campaigns")
      .update({ is_active: !campaign.is_active })
      .eq("id", campaign.id)

    if (error) toast.error("Failed to update status")
    else {
      toast.success(campaign.is_active ? "Campaign deactivated" : "Campaign activated")
      loadCampaigns()
    }
  }

  const exportCSV = () => {
    const headers = ["Name", "Max/Day", "Max/Week", "Start Time", "End Time", "Status", "Created At"]
    const rows = campaigns.map(c => [
      c.name,
      c.max_rides_per_day || "Unlimited",
      c.max_rides_per_week || "Unlimited",
      c.allowed_start_time || "Any",
      c.allowed_end_time || "Any",
      c.is_active ? "Active" : "Inactive",
      formatDate(c.created_at)
    ])

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `eligibility_campaigns_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Campaigns exported")
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-52 h-9 bg-muted rounded animate-pulse" />
          <div className="w-80 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid gap-4 grid-cols-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={4} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6" />
            Eligibility & Campaigns
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage ride limits, time restrictions, and eligibility rules
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button onClick={openAddDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create Campaign
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
              <Zap className="h-4 w-4 text-green-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-green-500">{campaigns.filter(c => c.is_active).length}</p>
              <p className="text-xs text-muted-foreground truncate">Active Campaigns</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20 shrink-0">
              <Calendar className="h-4 w-4 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight">{campaigns.length}</p>
              <p className="text-xs text-muted-foreground truncate">Total Campaigns</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 shrink-0">
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-blue-500">Daily</p>
              <p className="text-xs text-muted-foreground truncate">Quota Resets</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ride Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign Name</TableHead>
                <TableHead>Daily Limit</TableHead>
                <TableHead>Weekly Limit</TableHead>
                <TableHead>Time Window</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No campaigns created yet. Create your first campaign to set ride limits.
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((campaign) => (
                  <TableRow key={campaign.id} className="group hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>{campaign.max_rides_per_day || "Unlimited"}</TableCell>
                    <TableCell>{campaign.max_rides_per_week || "Unlimited"}</TableCell>
                    <TableCell>
                      {campaign.allowed_start_time && campaign.allowed_end_time
                        ? `${campaign.allowed_start_time} - ${campaign.allowed_end_time}`
                        : "24/7"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {campaign.target_roles?.join(", ") || "All"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={campaign.is_active ? "success" : "secondary"}>
                        {campaign.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(campaign.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(campaign)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(campaign)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleActive(campaign)}>
                              {campaign.is_active ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setSelectedCampaign(campaign)
                                setDialogType("delete")
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
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

      <Dialog open={dialogType === "add" || dialogType === "edit"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogType === "add" ? "Create Campaign" : "Edit Campaign"}</DialogTitle>
            <DialogDescription>
              Set ride limits and eligibility rules for users
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Campaign Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Default Limits"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Daily Ride Limit</label>
                <Input
                  type="number"
                  value={formData.max_rides_per_day}
                  onChange={(e) => setFormData({ ...formData, max_rides_per_day: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Weekly Ride Limit</label>
                <Input
                  type="number"
                  value={formData.max_rides_per_week}
                  onChange={(e) => setFormData({ ...formData, max_rides_per_week: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Start Time</label>
                <Input
                  type="time"
                  value={formData.allowed_start_time}
                  onChange={(e) => setFormData({ ...formData, allowed_start_time: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">End Time</label>
                <Input
                  type="time"
                  value={formData.allowed_end_time}
                  onChange={(e) => setFormData({ ...formData, allowed_end_time: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Target Users</label>
                <Select value={formData.target_roles} onValueChange={(v) => setFormData({ ...formData, target_roles: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="customer">Customers Only</SelectItem>
                    <SelectItem value="driver">Drivers Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={formData.is_active ? "active" : "inactive"} onValueChange={(v) => setFormData({ ...formData, is_active: v === "active" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : dialogType === "add" ? "Create Campaign" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogType === "delete"} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Campaign</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedCampaign?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
