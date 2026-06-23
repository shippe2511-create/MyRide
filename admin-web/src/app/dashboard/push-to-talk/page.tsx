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
  Send,
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Playback state
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  useEffect(() => {
    fetchData()

    // Realtime subscription for new messages
    const channel = supabase
      .channel('voice-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_messages' }, () => {
        fetchMessages()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
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
    const { data } = await supabase
      .from("voice_settings")
      .select("*")
      .single()
    if (data) setSettings(data)
  }

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("voice_messages")
      .select(`
        *,
        sender:profiles!voice_messages_sender_id_fkey(full_name),
        recipient:profiles!voice_messages_recipient_id_fkey(full_name)
      `)
      .order("created_at", { ascending: false })
      .limit(50)
    if (data) setMessages(data)
  }

  const fetchDrivers = async () => {
    const { data } = await supabase
      .from("drivers")
      .select("id, profile_id, is_online, profile:profiles!drivers_profile_id_fkey(id, full_name)")
    if (data) setDrivers(data as unknown as Driver[])
  }

  const updateSettings = async (updates: Partial<VoiceSettings>) => {
    if (!settings) return
    setSaving(true)

    const { error } = await supabase
      .from("voice_settings")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", settings.id)

    if (error) {
      toast.error("Failed to update settings")
    } else {
      setSettings({ ...settings, ...updates })
      toast.success("Settings updated")
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

      mediaRecorder.start()
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
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
      }
    }
  }

  const sendVoiceMessage = async () => {
    if (audioChunksRef.current.length === 0) return

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

    // Determine recipient
    let recipientId: string | null = null
    let recipientType = selectedRecipient

    if (selectedRecipient !== "broadcast" && selectedRecipient !== "all_drivers") {
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
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(messages.map(m => m.id)))
    }
  }

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
                  <Select value={selectedRecipient} onValueChange={setSelectedRecipient}>
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

                <div className="flex flex-col items-center py-6">
                  {isRecording && (
                    <div className="text-center mb-4">
                      <div className="text-3xl font-mono text-red-500 animate-pulse">
                        {formatDuration(recordingDuration)}
                      </div>
                      <p className="text-sm text-muted-foreground">Recording...</p>
                    </div>
                  )}

                  <button
                    type="button"
                    className={`h-20 w-20 rounded-full flex items-center justify-center transition-all cursor-pointer select-none ${
                      isRecording
                        ? "bg-red-500 hover:bg-red-600 scale-110"
                        : "bg-primary hover:bg-primary/90"
                    } ${!settings?.feature_enabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      if (settings?.feature_enabled && !isRecording) {
                        startRecording()
                      }
                    }}
                    onMouseUp={(e) => {
                      e.preventDefault()
                      if (isRecording) {
                        stopRecording()
                      }
                    }}
                    onMouseLeave={() => {
                      if (isRecording) {
                        stopRecording()
                      }
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault()
                      if (settings?.feature_enabled && !isRecording) {
                        startRecording()
                      }
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault()
                      if (isRecording) {
                        stopRecording()
                      }
                    }}
                    disabled={!settings?.feature_enabled}
                  >
                    {isRecording ? (
                      <MicOff className="h-8 w-8 text-white" />
                    ) : (
                      <Mic className="h-8 w-8 text-primary-foreground" />
                    )}
                  </button>

                  <p className="text-sm text-muted-foreground mt-4">
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
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Volume2 className="h-4 w-4" />
                    Recent Messages
                  </h3>
                  <Badge variant="secondary">{messages.length}</Badge>
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

              <div className="overflow-auto max-h-[600px]">
                {messages.length === 0 ? (
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
                            checked={selectedIds.size === messages.length && messages.length > 0}
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
                      {messages.map((message) => (
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
