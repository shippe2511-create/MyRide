"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { usePermissions } from "@/hooks/usePermissions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { AlertTriangle, Clock, FileWarning, RefreshCw, Bell, CheckCircle } from "lucide-react"
import { format, differenceInDays } from "date-fns"
import { PermissionGate } from "@/components/permission-gate"

interface ExpiringDocument {
  id: string
  document_type: string
  expiry_date: string
  status: string
  driver_id: string
  driver_name: string
  days_until_expiry: number
  reminder_sent: boolean
  department_id?: string | null
}

interface Department {
  id: string
  name: string
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  license: "Driver's License",
  id_card: "ID Card",
  vehicle_reg: "Vehicle Registration",
  insurance: "Insurance",
  medical: "Medical Certificate",
}

export default function DocumentExpiryPage() {
  const supabase = createClient()
  const { departmentId: userDepartmentId, canViewAllDepts } = usePermissions()
  const [documents, setDocuments] = useState<ExpiringDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])
  const [departmentFilter, setDepartmentFilter] = useState<string>("")
  const [departmentInitialized, setDepartmentInitialized] = useState(false)

  useEffect(() => {
    // Load departments
    async function loadDepartments() {
      const { data } = await supabase.from("departments").select("id, name").eq("is_active", true).order("name")
      if (data) setDepartments(data)
    }
    loadDepartments()

    // Realtime subscription for documents changes
    const channel = supabase
      .channel('document-expiry-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => {
        loadExpiringDocuments()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'document_expiry_reminders' }, () => {
        loadExpiringDocuments()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Set default department to user's department
  useEffect(() => {
    if (departments.length > 0 && !departmentInitialized) {
      if (userDepartmentId) {
        setDepartmentFilter(userDepartmentId)
      } else {
        setDepartmentFilter("all")
      }
      setDepartmentInitialized(true)
    }
  }, [departments, userDepartmentId, departmentInitialized])

  // Load documents when department filter changes
  useEffect(() => {
    if (departmentInitialized) {
      loadExpiringDocuments()
    }
  }, [departmentInitialized, departmentFilter])

  const loadExpiringDocuments = async () => {
    setLoading(true)

    const today = new Date()
    const in60Days = new Date()
    in60Days.setDate(in60Days.getDate() + 60)

    const { data, error } = await supabase
      .from("documents")
      .select(`
        id,
        document_type,
        expiry_date,
        status,
        driver_id,
        drivers!inner(
          department_id,
          profiles!inner(full_name)
        )
      `)
      .not("expiry_date", "is", null)
      .eq("status", "verified")
      .lte("expiry_date", in60Days.toISOString().split("T")[0])
      .order("expiry_date", { ascending: true })

    if (error) {
      console.error("Error loading documents:", error)
      toast.error("Failed to load documents")
      setLoading(false)
      return
    }

    // Get sent reminders
    const docIds = (data || []).map((d: any) => d.id)
    const { data: sentReminders } = await supabase
      .from("document_expiry_reminders")
      .select("document_id")
      .in("document_id", docIds)

    const sentSet = new Set((sentReminders || []).map((r: any) => r.document_id))

    const enriched = (data || []).map((doc: any) => {
      const expiryDate = new Date(doc.expiry_date)
      const daysUntil = differenceInDays(expiryDate, today)
      return {
        id: doc.id,
        document_type: doc.document_type,
        expiry_date: doc.expiry_date,
        status: doc.status,
        driver_id: doc.driver_id,
        driver_name: doc.drivers?.profiles?.full_name || "Unknown",
        department_id: doc.drivers?.department_id || null,
        days_until_expiry: daysUntil,
        reminder_sent: sentSet.has(doc.id),
      }
    })

    // Filter by department
    const filtered = departmentFilter && departmentFilter !== "all"
      ? enriched.filter(d => d.department_id === departmentFilter)
      : enriched

    setDocuments(filtered)
    setLoading(false)
  }

  const triggerExpiryCheck = async () => {
    setTriggering(true)
    try {
      const { data, error } = await supabase.rpc("check_document_expiry")
      if (error) {
        toast.error(error.message)
      } else {
        toast.success(`Sent ${data?.notifications_sent || 0} notifications`)
      }
    } catch (error) {
      toast.error("Failed to trigger check")
    }
    setTriggering(false)
  }

  const getExpiryBadge = (days: number) => {
    if (days < 0) {
      return <Badge variant="destructive">Expired {Math.abs(days)}d ago</Badge>
    } else if (days === 0) {
      return <Badge variant="destructive">Expires Today</Badge>
    } else if (days <= 7) {
      return <Badge className="bg-orange-500">Expires in {days}d</Badge>
    } else if (days <= 30) {
      return <Badge className="bg-yellow-500 text-black">Expires in {days}d</Badge>
    } else {
      return <Badge variant="outline">{days}d remaining</Badge>
    }
  }

  const expired = documents.filter((d) => d.days_until_expiry < 0)
  const expiringThisWeek = documents.filter((d) => d.days_until_expiry >= 0 && d.days_until_expiry <= 7)
  const expiringThisMonth = documents.filter((d) => d.days_until_expiry > 7 && d.days_until_expiry <= 30)
  const expiringSoon = documents.filter((d) => d.days_until_expiry > 30)

  return (
    <PermissionGate permission="drivers:view">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Document Expiry Monitor</h1>
          <p className="text-muted-foreground">Track driver documents expiring within 60 days</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              {canViewAllDepts && <SelectItem value="all">All Departments</SelectItem>}
              {(canViewAllDepts ? departments : departments.filter(d => d.id === userDepartmentId)).map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={loadExpiringDocuments} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={triggerExpiryCheck} disabled={triggering}>
            <Bell className={`h-4 w-4 mr-2 ${triggering ? "animate-pulse" : ""}`} />
            {triggering ? "Sending..." : "Send Reminders Now"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-0">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{expired.length}</div>
          </CardContent>
        </Card>
        <Card className="border-0">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <FileWarning className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{expiringThisWeek.length}</div>
          </CardContent>
        </Card>
        <Card className="border-0">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{expiringThisMonth.length}</div>
          </CardContent>
        </Card>
        <Card className="border-0">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">31-60 Days</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{expiringSoon.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Expired Documents */}
      {expired.length > 0 && (
        <Card className="border-red-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-5 w-5" />
              Expired Documents
            </CardTitle>
            <CardDescription>Requires immediate attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expired.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 border border-red-500/30 rounded-lg bg-red-500/5">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{doc.driver_name}</p>
                      {doc.reminder_sent && <Badge variant="outline" className="text-xs text-green-500 border-green-500">Notified</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}</p>
                  </div>
                  <div className="text-right">
                    {getExpiryBadge(doc.days_until_expiry)}
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(doc.expiry_date), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expiring This Week */}
      {expiringThisWeek.length > 0 && (
        <Card className="border-orange-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-500">
              <FileWarning className="h-5 w-5" />
              Expiring This Week
            </CardTitle>
            <CardDescription>Within 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringThisWeek.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 border border-orange-500/30 rounded-lg bg-orange-500/5">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{doc.driver_name}</p>
                      {doc.reminder_sent && <Badge variant="outline" className="text-xs text-green-500 border-green-500">Notified</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}</p>
                  </div>
                  <div className="text-right">
                    {getExpiryBadge(doc.days_until_expiry)}
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(doc.expiry_date), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expiring This Month */}
      {expiringThisMonth.length > 0 && (
        <Card className="border-yellow-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-500">
              <Clock className="h-5 w-5" />
              Expiring This Month
            </CardTitle>
            <CardDescription>8-30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringThisMonth.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{doc.driver_name}</p>
                    <p className="text-sm text-muted-foreground">{DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}</p>
                  </div>
                  <div className="text-right">
                    {getExpiryBadge(doc.days_until_expiry)}
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(doc.expiry_date), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 31-60 Days */}
      {expiringSoon.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Expiring in 31-60 Days
            </CardTitle>
            <CardDescription>Early notice</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringSoon.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{doc.driver_name}</p>
                    <p className="text-sm text-muted-foreground">{DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}</p>
                  </div>
                  <div className="text-right">
                    {getExpiryBadge(doc.days_until_expiry)}
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(doc.expiry_date), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {documents.length === 0 && !loading && (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <p className="text-lg font-medium">All Clear!</p>
            <p className="text-muted-foreground">No documents expiring in the next 60 days</p>
          </CardContent>
        </Card>
      )}
    </div>
    </PermissionGate>
  )
}
