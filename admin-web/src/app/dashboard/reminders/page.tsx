"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Bell, Plus, Trash2, Send, Clock, Users, User, Calendar } from "lucide-react"
import { format } from "date-fns"

interface Reminder {
  id: string
  title: string
  message: string
  target_type: string
  target_id: string | null
  remind_date: string
  remind_time: string
  is_sent: boolean
  is_active: boolean
  created_at: string
  sent_at: string | null
  target_name?: string
}

interface Profile {
  id: string
  full_name: string
  role: string
}

export default function RemindersPage() {
  const supabase = createClient()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [drivers, setDrivers] = useState<Profile[]>([])
  const [customers, setCustomers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null)

  const [form, setForm] = useState({
    title: "",
    message: "",
    target_type: "all_drivers",
    target_id: "",
    remind_date: format(new Date(), "yyyy-MM-dd"),
    remind_time: "08:00",
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)

    // Load reminders
    const { data: remindersData } = await supabase
      .from("reminders")
      .select("*")
      .order("remind_date", { ascending: true })

    // Load drivers
    const { data: driversData } = await supabase
      .from("drivers")
      .select("profile_id, profiles!inner(id, full_name)")

    // Load customers
    const { data: customersData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "customer")
      .order("full_name")

    // Get target names for reminders
    const enrichedReminders = (remindersData || []).map(r => {
      let target_name = ""
      if (r.target_type === "specific_driver" && r.target_id) {
        const driver = driversData?.find(d => (d.profiles as any).id === r.target_id)
        target_name = driver ? (driver.profiles as any).full_name : "Unknown"
      } else if (r.target_type === "specific_customer" && r.target_id) {
        const customer = customersData?.find(c => c.id === r.target_id)
        target_name = customer?.full_name || "Unknown"
      }
      return { ...r, target_name }
    })

    setReminders(enrichedReminders)
    setDrivers((driversData || []).map(d => ({ id: (d.profiles as any).id, full_name: (d.profiles as any).full_name, role: "driver" })))
    setCustomers(customersData || [])
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.title || !form.message || !form.remind_date) {
      toast.error("Please fill in all required fields")
      return
    }

    const payload = {
      title: form.title,
      message: form.message,
      target_type: form.target_type,
      target_id: (form.target_type === "specific_driver" || form.target_type === "specific_customer") ? form.target_id : null,
      remind_date: form.remind_date,
      remind_time: form.remind_time,
      is_active: true,
      is_sent: false,
    }

    if (editingReminder) {
      const { error } = await supabase
        .from("reminders")
        .update(payload)
        .eq("id", editingReminder.id)

      if (error) {
        toast.error("Failed to update reminder")
        return
      }
      toast.success("Reminder updated")
    } else {
      const { error } = await supabase
        .from("reminders")
        .insert(payload)

      if (error) {
        toast.error("Failed to create reminder")
        return
      }
      toast.success("Reminder created")
    }

    setShowDialog(false)
    resetForm()
    loadData()
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this reminder?")) return

    const { error } = await supabase.from("reminders").delete().eq("id", id)
    if (error) {
      toast.error("Failed to delete reminder")
      return
    }
    toast.success("Reminder deleted")
    loadData()
  }

  const handleSendNow = async (reminder: Reminder) => {
    if (!confirm("Send this reminder now?")) return

    // Update to trigger immediately
    const { error } = await supabase
      .from("reminders")
      .update({
        remind_date: format(new Date(), "yyyy-MM-dd"),
        remind_time: format(new Date(), "HH:mm")
      })
      .eq("id", reminder.id)

    if (error) {
      toast.error("Failed to update reminder")
      return
    }

    // Call the send function
    await supabase.rpc("send_scheduled_reminders")
    toast.success("Reminder sent!")
    loadData()
  }

  const resetForm = () => {
    setForm({
      title: "",
      message: "",
      target_type: "all_drivers",
      target_id: "",
      remind_date: format(new Date(), "yyyy-MM-dd"),
      remind_time: "08:00",
    })
    setEditingReminder(null)
  }

  const openEdit = (reminder: Reminder) => {
    setEditingReminder(reminder)
    setForm({
      title: reminder.title,
      message: reminder.message,
      target_type: reminder.target_type,
      target_id: reminder.target_id || "",
      remind_date: reminder.remind_date,
      remind_time: reminder.remind_time?.slice(0, 5) || "08:00",
    })
    setShowDialog(true)
  }

  const getTargetLabel = (reminder: Reminder) => {
    switch (reminder.target_type) {
      case "all_drivers": return "All Drivers"
      case "all_customers": return "All Customers"
      case "specific_driver": return reminder.target_name || "Specific Driver"
      case "specific_customer": return reminder.target_name || "Specific Customer"
      default: return reminder.target_type
    }
  }

  const pendingReminders = reminders.filter(r => !r.is_sent && r.is_active)
  const sentReminders = reminders.filter(r => r.is_sent)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reminders</h1>
          <p className="text-muted-foreground">Schedule notifications for drivers and customers</p>
        </div>
        <Button onClick={() => { resetForm(); setShowDialog(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          New Reminder
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingReminders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sentReminders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reminders.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Reminders */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pending Reminders
          </CardTitle>
          <CardDescription>Scheduled to be sent</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : pendingReminders.length === 0 ? (
            <p className="text-muted-foreground">No pending reminders</p>
          ) : (
            <div className="space-y-3">
              {pendingReminders.map(reminder => (
                <div key={reminder.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{reminder.title}</h3>
                      <Badge variant="outline">{getTargetLabel(reminder)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{reminder.message}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(reminder.remind_date), "MMM d, yyyy")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {reminder.remind_time?.slice(0, 5)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleSendNow(reminder)}>
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(reminder)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(reminder.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sent Reminders */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Sent Reminders
          </CardTitle>
          <CardDescription>Already delivered</CardDescription>
        </CardHeader>
        <CardContent>
          {sentReminders.length === 0 ? (
            <p className="text-muted-foreground">No sent reminders</p>
          ) : (
            <div className="space-y-3">
              {sentReminders.slice(0, 10).map(reminder => (
                <div key={reminder.id} className="flex items-center justify-between p-4 border rounded-lg opacity-60">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{reminder.title}</h3>
                      <Badge variant="secondary">{getTargetLabel(reminder)}</Badge>
                      <Badge variant="outline" className="text-green-500 border-green-500">Sent</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{reminder.message}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Sent: {reminder.sent_at ? format(new Date(reminder.sent_at), "MMM d, yyyy h:mm a") : "—"}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(reminder.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingReminder ? "Edit Reminder" : "New Reminder"}</DialogTitle>
            <DialogDescription>Schedule a notification to be sent</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Reminder title"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Message</label>
              <Textarea
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Reminder message"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Send To</label>
              <Select value={form.target_type} onValueChange={v => setForm(f => ({ ...f, target_type: v, target_id: "" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_drivers">All Drivers</SelectItem>
                  <SelectItem value="specific_driver">Specific Driver</SelectItem>
                  <SelectItem value="all_customers">All Customers</SelectItem>
                  <SelectItem value="specific_customer">Specific Customer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.target_type === "specific_driver" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Driver</label>
                <Select value={form.target_id} onValueChange={v => setForm(f => ({ ...f, target_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select driver" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.target_type === "specific_customer" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Customer</label>
                <Select value={form.target_id} onValueChange={v => setForm(f => ({ ...f, target_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={form.remind_date}
                  onChange={e => setForm(f => ({ ...f, remind_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Time</label>
                <Input
                  type="time"
                  value={form.remind_time}
                  onChange={e => setForm(f => ({ ...f, remind_time: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingReminder ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
