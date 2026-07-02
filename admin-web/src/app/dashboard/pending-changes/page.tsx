"use client"

import { useState, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { PermissionGate } from "@/components/permission-gate"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Check, X, Clock, User, Phone, CreditCard, Loader2, ArrowRight } from "lucide-react"
import { SkeletonTable } from "@/components/ui/skeleton-card"
import { toast } from "sonner"
import { formatDate } from "@/lib/utils"

const supabase = createClient()

interface PendingChange {
  id: string
  user_id: string
  field_name: string
  old_value: string | null
  new_value: string
  status: string
  submitted_at: string
  profile?: {
    full_name: string
    email: string
    phone: string
    avatar_url: string | null
    role: string
  }
}

export default function PendingChangesPage() {
  const queryClient = useQueryClient()
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [selectedChange, setSelectedChange] = useState<PendingChange | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [processing, setProcessing] = useState<string | null>(null)

  const { data: changes = [], isLoading } = useQuery({
    queryKey: ["pending-changes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pending_profile_changes")
        .select(`
          *,
          profile:profiles!pending_profile_changes_user_id_fkey(
            full_name, email, phone, avatar_url, role
          )
        `)
        .eq("status", "pending")
        .order("submitted_at", { ascending: false })
      return (data || []) as PendingChange[]
    },
  })

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("pending_changes_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pending_profile_changes" }, () => {
        queryClient.invalidateQueries({ queryKey: ["pending-changes"] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  const handleApprove = async (change: PendingChange) => {
    setProcessing(change.id)
    try {
      const { data, error } = await supabase.rpc("approve_profile_change", { change_id: change.id })
      if (error) throw error
      toast.success(`Approved ${change.field_name} change for ${change.profile?.full_name}`)
      queryClient.invalidateQueries({ queryKey: ["pending-changes"] })
    } catch (e: any) {
      toast.error("Failed to approve: " + e.message)
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async () => {
    if (!selectedChange) return
    setProcessing(selectedChange.id)
    try {
      const { error } = await supabase.rpc("reject_profile_change", {
        change_id: selectedChange.id,
        reason: rejectReason || null,
      })
      if (error) throw error
      toast.success(`Rejected ${selectedChange.field_name} change`)
      setRejectDialogOpen(false)
      setSelectedChange(null)
      setRejectReason("")
      queryClient.invalidateQueries({ queryKey: ["pending-changes"] })
    } catch (e: any) {
      toast.error("Failed to reject: " + e.message)
    } finally {
      setProcessing(null)
    }
  }

  const getFieldIcon = (field: string) => {
    switch (field) {
      case "phone": return <Phone className="h-4 w-4" />
      case "employee_id": return <CreditCard className="h-4 w-4" />
      default: return <User className="h-4 w-4" />
    }
  }

  const getFieldLabel = (field: string) => {
    switch (field) {
      case "phone": return "Phone Number"
      case "employee_id": return "Employee ID"
      default: return field
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="w-48 h-8 bg-muted rounded animate-pulse" />
          <div className="w-72 h-4 bg-muted rounded animate-pulse mt-2" />
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <PermissionGate permission="customers:manage">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending Profile Changes</h1>
          <p className="text-muted-foreground">
            Review and approve profile changes from customers and drivers
          </p>
        </div>

        <div className="grid gap-4 grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{changes.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Phone Changes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {changes.filter(c => c.field_name === "phone").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Employee ID Changes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {changes.filter(c => c.field_name === "employee_id").length}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pending Requests</CardTitle>
            <CardDescription>
              Phone and Employee ID changes require admin approval
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No pending changes to review
                    </TableCell>
                  </TableRow>
                ) : (
                  changes.map((change) => (
                    <TableRow key={change.id} className="group hover:bg-muted/50 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={change.profile?.avatar_url || ""} />
                            <AvatarFallback>
                              {change.profile?.full_name?.charAt(0) || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{change.profile?.full_name}</p>
                            <p className="text-xs text-muted-foreground">{change.profile?.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={change.profile?.role === "driver" ? "default" : "secondary"}>
                          {change.profile?.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getFieldIcon(change.field_name)}
                          <span>{getFieldLabel(change.field_name)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground line-through">
                            {change.old_value || "(empty)"}
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium text-primary">{change.new_value}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(change.submitted_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                            onClick={() => handleApprove(change)}
                            disabled={processing === change.id}
                          >
                            {processing === change.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setSelectedChange(change)
                              setRejectDialogOpen(true)
                            }}
                            disabled={processing === change.id}
                          >
                            <X className="h-4 w-4" />
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

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Change</DialogTitle>
              <DialogDescription>
                Optionally provide a reason for rejecting this change. The user will be notified.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="Reason for rejection (optional)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={processing !== null}
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Reject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGate>
  )
}
