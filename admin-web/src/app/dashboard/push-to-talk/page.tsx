"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Mic,
  MicOff,
  Radio,
  Play,
  Pause,
  Trash2,
  Settings,
  Users,
  Volume2,
  Clock,
  Search,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
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
import { PermissionGate } from "@/components/permission-gate"

interface VoiceSettings {
  id: string
  feature_enabled: boolean
  max_duration_seconds: number
  allowed_senders: string[]
  broadcast_enabled: boolean
}

interface VoiceMessage {
  id: string
  sender_id: string
  sender_type: string
  recipient_id: string | null
  recipient_type: string
  audio_url: string
  duration_seconds: number
  is_played: boolean
  created_at: string
  sender?: { full_name: string }
  recipient?: { full_name: string }
}

interface Driver {
  id: string
  profile_id: string
  profile: { id: string; full_name: string }
  is_online: boolean
}

export default function PushToTalkPage() {
  const supabase = createClient()
  const [settings, setSettings] = useState<VoiceSettings | null>(null)
  const [messages, setMessages] = useState<VoiceMessage[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [selectedRecipient, setSelectedRecipient] = useState<string>("all_drivers")
  const [selectedDrivers, setSelectedDrivers] = useState<Set<string>>(new Set())
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Playback state
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Filter state
  const [filterSender, setFilterSender] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterDate, setFilterDate] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState<string>("")

  useEffect(() => {
    fetchData()

    // Realtime subscription for new messages
    const channel = supabase
      .channel('voice-messages-live')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'voice_messages'
      }, (payload) => {
        fetchMessages()
      })
      .subscribe((status) => {
      })

    // Polling fallback every 5 seconds
    const pollInterval = setInterval(() => {
      fetchMessages()
    }, 5000)


    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  const fetchData = async () => {
    setLoading(true)
    await Promise.all([fetchSettings(), fetchMessages(), fetchDrivers()])
    setLoading(false)
  }

  const fetchSettings = async () => {
    // First check how many rows exist
    const { data: allRows, error: countError } = await supabase
      .from("voice_settings")
      .select("*")

    console.log("All voice_settings rows:", allRows, countError)

    if (allRows && allRows.length > 0) {
      // Use the first row
      setSettings(allRows[0])
    } else {
      // No row exists, create default settings
      const { data: newSettings, error: insertError } = await supabase
        .from("voice_settings")
        .insert({
          feature_enabled: false,
          max_duration_seconds: 60,
          allowed_senders: ['admin'],
          broadcast_enabled: false,
        })
        .select()
        .single()

      console.log("Created new voice settings:", newSettings, insertError)

      if (newSettings) {
        setSettings(newSettings)
      } else if (insertError) {
        console.error("Error creating voice settings:", insertError)
        toast.error("Failed to initialize voice settings")
      }
    }
  }

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from("voice_messages")
      .select(`
        *,
        sender:profiles!sender_id(full_name)
      `)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("Error fetching messages:", error)
      return
    }
    if (data) setMessages(data)
  }

  const fetchDrivers = async () => {
    const { data } = await supabase
      .from("drivers")
      .select("id, profile_id, is_online, profile:profiles!drivers_profile_id_fkey(id, full_name)")
    if (data) setDrivers(data as unknown as Driver[])
  }

  const updateSettings = async (updates: Partial<VoiceSettings>) => {
    if (!settings) {
      console.error("No settings to update")
      return
    }
    setSaving(true)

    console.log("Updating settings:", settings.id, updates)

    const { data, error } = await supabase
      .from("voice_settings")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", settings.id)
      .select()
      .single()

    console.log("Update result:", data, error)

    if (error) {
      console.error("Error updating settings:", error)
      toast.error("Failed to update settings: " + error.message)
    } else if (data) {
      setSettings(data)
      toast.success("Settings updated")
    } else {
      console.error("No data returned from update")
      toast.error("Update failed - no data returned")
    }
    setSaving(false)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        await sendVoiceMessage()
      }

      mediaRecorder.start(100) // Collect data every 100ms for immediate availability
      setIsRecording(true)
      setRecordingDuration(0)

      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= (settings?.max_duration_seconds || 60)) {
            stopRecording()
            return prev
          }
          return prev + 1
        })
      }, 1000)

    } catch (err) {
      toast.error("Could not access microphone")
      console.error(err)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
      }
    }
  }

  const sendVoiceMessage = async () => {
    if (audioChunksRef.current.length === 0) {
      return
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
    const fileName = `voice_${Date.now()}.webm`

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("voice-messages")
      .upload(fileName, audioBlob)

    if (uploadError) {
      toast.error("Failed to upload voice message")
      console.error(uploadError)
      return
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("voice-messages")
      .getPublicUrl(fileName)

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Handle selected drivers - send to each one
    if (selectedRecipient === "selected" && selectedDrivers.size > 0) {
      const messages = Array.from(selectedDrivers).map(driverId => ({
        sender_id: user.id,
        sender_type: "admin",
        recipient_id: driverId,
        recipient_type: "driver",
        audio_url: urlData.publicUrl,
        duration_seconds: recordingDuration,
      }))

      const { error } = await supabase.from("voice_messages").insert(messages)

      if (error) {
        toast.error("Failed to send voice messages")
      } else {
        toast.success(`Voice message sent to ${selectedDrivers.size} driver${selectedDrivers.size > 1 ? 's' : ''}`)
        setRecordingDuration(0)
        fetchMessages()
      }
      return
    }

    // Determine recipient for single/broadcast
    let recipientId: string | null = null
    let recipientType = selectedRecipient

    if (selectedRecipient !== "broadcast" && selectedRecipient !== "all_drivers" && selectedRecipient !== "selected") {
      recipientId = selectedRecipient
      recipientType = "driver"
    }

    // Save message
    const { error } = await supabase
      .from("voice_messages")
      .insert({
        sender_id: user.id,
        sender_type: "admin",
        recipient_id: recipientId,
        recipient_type: recipientType,
        audio_url: urlData.publicUrl,
        duration_seconds: recordingDuration,
      })

    if (error) {
      toast.error("Failed to send voice message")
    } else {
      toast.success("Voice message sent")
      setRecordingDuration(0)
      fetchMessages()
    }
  }

  const playMessage = async (message: VoiceMessage) => {
    if (playingId === message.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
    }

    const audio = new Audio(message.audio_url)
    audioRef.current = audio

    audio.onended = () => setPlayingId(null)
    audio.play()
    setPlayingId(message.id)

    // Mark as played
    if (!message.is_played) {
      await supabase
        .from("voice_messages")
        .update({ is_played: true, played_at: new Date().toISOString() })
        .eq("id", message.id)
    }
  }

  const deleteMessage = async (id: string) => {
    const { error } = await supabase
      .from("voice_messages")
      .delete()
      .eq("id", id)

    if (error) {
      toast.error("Failed to delete message")
    } else {
      setMessages(prev => prev.filter(m => m.id !== id))
      toast.success("Message deleted")
    }
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredMessages.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredMessages.map(m => m.id)))
    }
  }

  // Filter messages based on all criteria
  const filteredMessages = messages.filter(m => {
    // Sender filter
    if (filterSender !== "all") {
      if (filterSender === "admin" && m.sender_type !== "admin") return false
      if (filterSender === "driver" && m.sender_type !== "driver") return false
      if (filterSender.startsWith("driver:")) {
        const driverId = filterSender.replace("driver:", "")
        if (m.sender_id !== driverId) return false
      }
    }

    // Status filter
    if (filterStatus === "new" && m.is_played) return false
    if (filterStatus === "played" && !m.is_played) return false

    // Date filter
    if (filterDate !== "all") {
      const msgDate = new Date(m.created_at)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

      if (filterDate === "today" && msgDate < today) return false
      if (filterDate === "yesterday" && (msgDate < yesterday || msgDate >= today)) return false
      if (filterDate === "week" && msgDate < weekAgo) return false
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const senderName = m.sender?.full_name?.toLowerCase() || ""
      if (!senderName.includes(query)) return false
    }

    return true
  })

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    const { error } = await supabase
      .from("voice_messages")
      .delete()
      .in("id", ids)

    if (error) {
      toast.error("Failed to delete messages")
    } else {
      setMessages(prev => prev.filter(m => !selectedIds.has(m.id)))
      setSelectedIds(new Set())
      toast.success(`${ids.length} message(s) deleted`)
    }
    setDeleteDialogOpen(false)
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      timeZone: "Indian/Maldives",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  const onlineDrivers = drivers.filter(d => d.is_online)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <PermissionGate permission="settings:view">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Radio className="h-8 w-8" />
              Push to Talk
            </h1>
            <p className="text-muted-foreground">Walkie-talkie style voice communication</p>
          </div>
          <Badge variant={settings?.feature_enabled ? "default" : "secondary"} className="text-sm">
            {settings?.feature_enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Recording & Settings */}
          <div className="space-y-6">
            {/* Recording Card */}
            <Card className="p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Send Voice Message
              </h3>

              <div className="space-y-4">
                <div>
                  <Label>Send To</Label>
                  <Select value={selectedRecipient} onValueChange={(v) => {
                    setSelectedRecipient(v)
                    if (v !== "selected") setSelectedDrivers(new Set())
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_drivers">
                        <span className="flex items-center gap-2">
                          <Radio className="h-4 w-4" />
                          All Drivers
                        </span>
                      </SelectItem>
                      <SelectItem value="selected">
                        <span className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Selected Drivers
                        </span>
                      </SelectItem>
                      {drivers.map(driver => (
                        <SelectItem key={driver.profile_id} value={driver.profile_id}>
                          <span className="flex items-center gap-2">
                            {driver.is_online && <span className="h-2 w-2 rounded-full bg-green-500" />}
                            {driver.profile.full_name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedRecipient === "selected" && (
                  <div className="space-y-2 max-h-[150px] overflow-y-auto border rounded-lg p-2">
                    {drivers.map(driver => (
                      <div key={driver.profile_id} className="flex items-center gap-2">
                        <Checkbox
                          id={driver.profile_id}
                          checked={selectedDrivers.has(driver.profile_id)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedDrivers)
                            if (checked) {
                              newSet.add(driver.profile_id)
                            } else {
                              newSet.delete(driver.profile_id)
                            }
                            setSelectedDrivers(newSet)
                          }}
                        />
                        <Label htmlFor={driver.profile_id} className="flex items-center gap-2 cursor-pointer">
                          {driver.is_online && <span className="h-2 w-2 rounded-full bg-green-500" />}
                          {driver.profile.full_name}
                        </Label>
                      </div>
                    ))}
                    {selectedDrivers.size > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {selectedDrivers.size} driver{selectedDrivers.size > 1 ? 's' : ''} selected
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-col items-center py-6">
                  {isRecording && (
                    <div className="text-center mb-4">
                      <div className="text-3xl font-mono text-red-500 animate-pulse">
                        {formatDuration(recordingDuration)}
                      </div>
                      <p className="text-sm text-muted-foreground">Recording...</p>
                    </div>
                  )}

                  <div className="relative">
                    {/* Outer glow ring */}
                    <div className={`absolute inset-0 rounded-full transition-all duration-300 ${
                      isRecording
                        ? "bg-red-500/30 animate-ping"
                        : "bg-primary/20"
                    }`} style={{ transform: 'scale(1.3)' }} />

                    {/* Middle ring */}
                    <div className={`absolute inset-0 rounded-full transition-all duration-200 ${
                      isRecording
                        ? "bg-red-500/40 scale-125"
                        : "bg-primary/30 scale-110"
                    }`} />

                    {/* Main button */}
                    <button
                      type="button"
                      className={`relative h-24 w-24 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer select-none shadow-lg ${
                        isRecording
                          ? "bg-gradient-to-br from-red-500 to-red-600 scale-110 shadow-red-500/50"
                          : "bg-gradient-to-br from-primary to-primary/80 hover:scale-105 shadow-primary/50"
                      } ${!settings?.feature_enabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        if (settings?.feature_enabled && !isRecording) {
                          startRecording()
                        }
                      }}
                      onMouseUp={(e) => {
                        e.preventDefault()
                        if (mediaRecorderRef.current?.state === 'recording') {
                          stopRecording()
                        }
                      }}
                      onMouseLeave={() => {
                        if (mediaRecorderRef.current?.state === 'recording') {
                          stopRecording()
                        }
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault()
                        if (settings?.feature_enabled && mediaRecorderRef.current?.state !== 'recording') {
                          startRecording()
                        }
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault()
                        if (mediaRecorderRef.current?.state === 'recording') {
                          stopRecording()
                        }
                      }}
                      disabled={!settings?.feature_enabled}
                    >
                      {isRecording ? (
                        <MicOff className="h-10 w-10 text-white drop-shadow-lg" />
                      ) : (
                        <Mic className="h-10 w-10 text-primary-foreground drop-shadow-lg" />
                      )}
                    </button>
                  </div>

                  <p className="text-sm text-muted-foreground mt-6">
                    {settings?.feature_enabled
                      ? "Hold to record, release to send"
                      : "Feature disabled"
                    }
                  </p>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Max: {settings?.max_duration_seconds}s
                </div>
              </div>
            </Card>

            {/* Settings Card */}
            <Card className="p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </h3>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Feature Enabled</Label>
                    <p className="text-sm text-muted-foreground">Enable push-to-talk globally</p>
                  </div>
                  <Switch
                    checked={settings?.feature_enabled}
                    onCheckedChange={(checked) => updateSettings({ feature_enabled: checked })}
                    disabled={saving}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Broadcast Enabled</Label>
                    <p className="text-sm text-muted-foreground">Allow broadcast messages</p>
                  </div>
                  <Switch
                    checked={settings?.broadcast_enabled}
                    onCheckedChange={(checked) => updateSettings({ broadcast_enabled: checked })}
                    disabled={saving}
                  />
                </div>

                <div>
                  <Label>Max Duration (seconds)</Label>
                  <Input
                    type="number"
                    min={10}
                    max={120}
                    value={settings?.max_duration_seconds || 60}
                    onChange={(e) => updateSettings({ max_duration_seconds: parseInt(e.target.value) || 60 })}
                    className="mt-1"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Allow Drivers to Send</Label>
                    <p className="text-sm text-muted-foreground">Drivers can send voice messages</p>
                  </div>
                  <Switch
                    checked={settings?.allowed_senders?.includes("driver")}
                    onCheckedChange={(checked) => {
                      const senders = checked
                        ? [...(settings?.allowed_senders || []), "driver"]
                        : settings?.allowed_senders?.filter(s => s !== "driver") || []
                      updateSettings({ allowed_senders: senders })
                    }}
                    disabled={saving}
                  />
                </div>
              </div>
            </Card>

            {/* Online Drivers */}
            <Card className="p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Online Drivers
                <Badge variant="secondary">{onlineDrivers.length}</Badge>
              </h3>

              {onlineDrivers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No drivers online</p>
              ) : (
                <div className="space-y-2">
                  {onlineDrivers.map(driver => (
                    <div key={driver.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {driver.profile.full_name.split(" ").map(n => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{driver.profile.full_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Right Column - Messages */}
          <div className="lg:col-span-2">
            <Card>
              <div className="p-4 border-b space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Volume2 className="h-4 w-4" />
                      Recent Messages
                    </h3>
                    <Badge variant="secondary">{filteredMessages.length}</Badge>
                  </div>
                  {selectedIds.size > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete ({selectedIds.size})
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 w-[180px]"
                    />
                  </div>
                  <Select value={filterSender} onValueChange={setFilterSender}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Sender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Senders</SelectItem>
                      <SelectItem value="admin">Admin Only</SelectItem>
                      <SelectItem value="driver">All Drivers</SelectItem>
                      {drivers.map(driver => (
                        <SelectItem key={`filter-${driver.profile_id}`} value={`driver:${driver.profile_id}`}>
                          <span className="flex items-center gap-2">
                            {driver.is_online && <span className="h-2 w-2 rounded-full bg-green-500" />}
                            {driver.profile.full_name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="played">Played</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterDate} onValueChange={setFilterDate}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Date" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="week">Last 7 Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="overflow-auto max-h-[600px]">
                {filteredMessages.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Volume2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No voice messages yet</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedIds.size === filteredMessages.length && filteredMessages.length > 0}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMessages.map((message) => (
                        <TableRow key={message.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(message.id)}
                              onCheckedChange={() => toggleSelect(message.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs">
                                  {message.sender?.full_name?.split(" ").map(n => n[0]).join("") || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">{message.sender?.full_name || "Unknown"}</p>
                                <Badge variant="outline" className="text-xs">{message.sender_type}</Badge>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {message.recipient_type === "broadcast" ? (
                              <Badge variant="secondary">Broadcast</Badge>
                            ) : message.recipient_type === "all_drivers" ? (
                              <Badge variant="secondary">All Drivers</Badge>
                            ) : (
                              <span className="text-sm">{message.recipient?.full_name || "Unknown"}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-sm">{formatDuration(message.duration_seconds)}</span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(message.created_at)}
                          </TableCell>
                          <TableCell>
                            {message.is_played ? (
                              <Badge variant="outline" className="text-green-600">Played</Badge>
                            ) : (
                              <Badge variant="default">New</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => playMessage(message)}
                              >
                                {playingId === message.id ? (
                                  <Pause className="h-4 w-4" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => deleteMessage(message.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Voice Messages</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} voice message(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PermissionGate>
  )
}
