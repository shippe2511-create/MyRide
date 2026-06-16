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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  ClipboardCheck, AlertTriangle, CheckCircle, XCircle, Car,
  Loader2, RefreshCw, Download, Image as ImageIcon
} from "lucide-react"
import { toast } from "sonner"

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
}

const ITEM_LABELS: Record<string, string> = {
  fuel: "Fuel Level", tires: "Tires", lights: "Lights", body: "Body Condition",
  ac: "A/C", safety: "Safety Kit", documents: "Documents", seatbelts: "Seatbelts", cleanliness: "Cleanliness",
}

export default function ChecklistsPage() {
  const supabase = createClient()
  const [checklists, setChecklists] = useState<VehicleChecklist[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [selectedChecklist, setSelectedChecklist] = useState<VehicleChecklist | null>(null)

  const [stats, setStats] = useState({ total: 0, withIssues: 0, passed: 0 })

  useEffect(() => {
    loadChecklists()
  }, [filter])

  const loadChecklists = async () => {
    setLoading(true)
    let query = supabase.from("vehicle_checklists").select("*").order("checked_at", { ascending: false }).limit(50)

    if (filter === "issues") query = query.eq("has_issues", true)
    if (filter === "passed") query = query.eq("has_issues", false)

    const [checklistsRes, totalRes, issuesRes, passedRes] = await Promise.all([
      query,
      supabase.from("vehicle_checklists").select("*", { count: "exact", head: true }),
      supabase.from("vehicle_checklists").select("*", { count: "exact", head: true }).eq("has_issues", true),
      supabase.from("vehicle_checklists").select("*", { count: "exact", head: true }).eq("has_issues", false),
    ])

    setChecklists(checklistsRes.data || [])
    setStats({ total: totalRes.count || 0, withIssues: issuesRes.count || 0, passed: passedRes.count || 0 })
    setLoading(false)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  const getFailedItems = (checklist: VehicleChecklist) => {
    if (!checklist.all_items) return []
    return Object.entries(checklist.all_items).filter(([, passed]) => !passed).map(([key]) => key)
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
            <ClipboardCheck className="h-6 w-6" />
            Pre-trip Checks
          </h1>
          <p className="text-sm text-muted-foreground">Driver vehicle inspections</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadChecklists}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </div>
        </Card>
        <Card className={`p-4 ${stats.withIssues > 0 ? "border-red-500" : ""}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stats.withIssues > 0 ? "bg-red-500/10" : "bg-muted"}`}>
              <AlertTriangle className={`h-5 w-5 ${stats.withIssues > 0 ? "text-red-500" : ""}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${stats.withIssues > 0 ? "text-red-500" : ""}`}>{stats.withIssues}</p>
              <p className="text-xs text-muted-foreground">With Issues</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-500">{stats.passed}</p>
              <p className="text-xs text-muted-foreground">Passed</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
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
              <TableHead>Driver</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Failed Items</TableHead>
              <TableHead>Date</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {checklists.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No checklists found
                </TableCell>
              </TableRow>
            ) : (
              checklists.map(checklist => {
                const failedItems = getFailedItems(checklist)
                return (
                  <TableRow key={checklist.id} className={checklist.has_issues ? "bg-red-50 dark:bg-red-950/20" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>{checklist.driver_name?.[0] || "?"}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm">{checklist.driver_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Car className="h-4 w-4 text-muted-foreground" />
                        {checklist.vehicle_number}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={checklist.has_issues ? "bg-red-500" : "bg-green-500"}>
                        {checklist.has_issues ? "Issues" : "Passed"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {failedItems.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {failedItems.slice(0, 2).map(item => (
                            <Badge key={item} variant="outline" className="text-xs text-red-500 border-red-300">
                              {ITEM_LABELS[item] || item}
                            </Badge>
                          ))}
                          {failedItems.length > 2 && (
                            <Badge variant="outline" className="text-xs">+{failedItems.length - 2}</Badge>
                          )}
                        </div>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(checklist.checked_at)}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => setSelectedChecklist(checklist)}>
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!selectedChecklist} onOpenChange={() => setSelectedChecklist(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Checklist Details</DialogTitle>
          </DialogHeader>
          {selectedChecklist && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted rounded-lg text-sm">
                <div><span className="text-muted-foreground">Driver:</span> {selectedChecklist.driver_name}</div>
                <div><span className="text-muted-foreground">Vehicle:</span> {selectedChecklist.vehicle_number}</div>
                <div><span className="text-muted-foreground">Date:</span> {formatDate(selectedChecklist.checked_at)}</div>
                <div>
                  <Badge className={selectedChecklist.has_issues ? "bg-red-500" : "bg-green-500"}>
                    {selectedChecklist.has_issues ? "Issues Found" : "Passed"}
                  </Badge>
                </div>
              </div>

              {selectedChecklist.has_issues && selectedChecklist.issues && (
                <div className="p-3 border border-red-200 rounded-lg bg-red-50 dark:bg-red-950/20">
                  <h3 className="font-medium text-red-600 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Issues
                  </h3>
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
                                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded">
                                    <Download className="h-4 w-4 text-white" />
                                  </span>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
