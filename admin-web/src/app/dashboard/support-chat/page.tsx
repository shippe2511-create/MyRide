"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { formatPhone } from "@/lib/format-phone"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  MessageSquare,
  Send,
  Search,
  CheckCircle,
  Clock,
  User,
  RefreshCw,
  Loader2,
  Trash2,
} from "lucide-react"
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
import { SkeletonCard } from "@/components/ui/skeleton-card"
import { PermissionGate } from "@/components/permission-gate"

interface SupportChat {
  id: string
  customer_id: string
  status: string
  created_at: string
  updated_at: string
  customer?: {
    full_name: string
    phone: string | null
    email: string | null
    employee_id: string | null
  }
  last_message?: string
  unread_count?: number
}

interface ChatMessage {
  id: string
  chat_id: string
  sender_id: string
  sender_type: string
  message: string
  is_read: boolean
  created_at: string
  image_url?: string | null
  latitude?: number | null
  longitude?: number | null
}

export default function SupportChatPage() {
  const supabase = createClient()
  const [chats, setChats] = useState<SupportChat[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedChat, setSelectedChat] = useState<SupportChat | null>(null)
  const [newMessage, setNewMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState("")
  const [adminId, setAdminId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [chatToDelete, setChatToDelete] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [stats, setStats] = useState({ total: 0, open: 0, active: 0, resolved: 0 })

  const canDelete = userRole === 'admin' || userRole === 'super-admin'

  useEffect(() => {
    loadAdminId()
    loadChats()

    const channel = supabase
      .channel('support_chats_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_chats' }, () => {
        loadChats()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_chat_messages' }, (payload) => {
        if (selectedChat && payload.new.chat_id === selectedChat.id) {
          setMessages(prev => [...prev, payload.new as ChatMessage])
          scrollToBottom()
        }
        loadChats()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedChat?.id])

  const loadAdminId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('email', user.email)
        .single()
      if (profile) {
        setAdminId(profile.id)
        setUserRole(profile.role)
      }
    }
  }

  const handleDeleteChat = async () => {
    if (!chatToDelete) return

    // First delete all messages in the chat
    await supabase
      .from('support_chat_messages')
      .delete()
      .eq('chat_id', chatToDelete)

    // Then delete the chat itself
    const { error } = await supabase
      .from('support_chats')
      .delete()
      .eq('id', chatToDelete)

    if (error) {
      toast.error('Failed to delete chat')
    } else {
      toast.success('Chat deleted')
      setChats(prev => prev.filter(c => c.id !== chatToDelete))
      if (selectedChat?.id === chatToDelete) {
        setSelectedChat(null)
        setMessages([])
      }
    }
    setDeleteDialogOpen(false)
    setChatToDelete(null)
  }

  const confirmDelete = (chatId: string) => {
    setChatToDelete(chatId)
    setDeleteDialogOpen(true)
  }

  const loadChats = async () => {
    const [chatsRes, totalRes, openRes, activeRes, resolvedRes] = await Promise.all([
      supabase
        .from('support_chats')
        .select(`
          *,
          customer:profiles!support_chats_customer_id_fkey(full_name, phone, email, employee_id)
        `)
        .order('updated_at', { ascending: false }),
      supabase.from('support_chats').select('*', { count: 'exact', head: true }),
      supabase.from('support_chats').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('support_chats').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('support_chats').select('*', { count: 'exact', head: true }).eq('status', 'resolved'),
    ])

    if (chatsRes.data) {
      const chatsWithMessages = await Promise.all(
        chatsRes.data.map(async (chat) => {
          const { data: lastMsg } = await supabase
            .from('support_chat_messages')
            .select('message')
            .eq('chat_id', chat.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          const { count: unread } = await supabase
            .from('support_chat_messages')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', chat.id)
            .eq('sender_type', 'customer')
            .eq('is_read', false)

          return {
            ...chat,
            last_message: lastMsg?.message,
            unread_count: unread || 0,
          }
        })
      )
      setChats(chatsWithMessages)
    }

    setStats({
      total: totalRes.count || 0,
      open: openRes.count || 0,
      active: activeRes.count || 0,
      resolved: resolvedRes.count || 0,
    })
    setLoading(false)
  }

  const loadMessages = async (chatId: string) => {
    const { data } = await supabase
      .from('support_chat_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })

    setMessages(data || [])
    scrollToBottom()

    await supabase
      .from('support_chat_messages')
      .update({ is_read: true })
      .eq('chat_id', chatId)
      .eq('sender_type', 'customer')
  }

  const selectChat = async (chat: SupportChat) => {
    setSelectedChat(chat)
    await loadMessages(chat.id)
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat || !adminId) return

    setSending(true)
    const { error } = await supabase.from('support_chat_messages').insert({
      chat_id: selectedChat.id,
      sender_id: adminId,
      sender_type: 'admin',
      message: newMessage.trim(),
    })

    if (error) {
      toast.error('Failed to send message')
    } else {
      setNewMessage('')
      await supabase.from('support_chats').update({
        status: 'active',
        updated_at: new Date().toISOString(),
      }).eq('id', selectedChat.id)
    }
    setSending(false)
  }

  const resolveChat = async () => {
    if (!selectedChat) return
    const { error } = await supabase.from('support_chats').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    }).eq('id', selectedChat.id)

    if (error) {
      toast.error('Failed to resolve chat')
    } else {
      toast.success('Chat resolved')
      setSelectedChat({ ...selectedChat, status: 'resolved' })
      loadChats()
    }
  }

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  const formatTime = (date: string) => {
    return new Date(date).toLocaleString('en-US', {
      timeZone: 'Indian/Maldives',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return formatTime(date)
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString('en-US', { timeZone: 'Indian/Maldives' })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-blue-500">Open</Badge>
      case 'active':
        return <Badge className="bg-green-500">Active</Badge>
      case 'resolved':
        return <Badge variant="secondary">Resolved</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const filteredChats = chats.filter(chat =>
    chat.customer?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    chat.customer?.phone?.includes(search) ||
    chat.customer?.employee_id?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="w-48 h-8 bg-muted rounded animate-pulse" />
        <div className="grid gap-4 grid-cols-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <PermissionGate permission="chat:view">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            Support Chat
          </h1>
          <p className="text-sm text-muted-foreground">Live chat with customers</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadChats()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-4">
        <Card className="p-4 bg-gradient-to-br from-slate-500/10 to-slate-600/5 border-slate-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/20">
              <MessageSquare className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <p className="text-xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-blue-500">{stats.open}</p>
              <p className="text-xs text-muted-foreground">Open</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <MessageSquare className="h-4 w-4 text-green-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-green-500">{stats.active}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-gray-500/10 to-gray-600/5 border-gray-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-500/20">
              <CheckCircle className="h-4 w-4 text-gray-400" />
            </div>
            <div>
              <p className="text-xl font-bold">{stats.resolved}</p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4 h-[calc(100vh-320px)]">
        <Card className="col-span-1 flex flex-col h-[600px]">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search chats..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {filteredChats.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No chats found
              </div>
            ) : (
              filteredChats.map(chat => (
                <div
                  key={chat.id}
                  onClick={() => selectChat(chat)}
                  className={`p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedChat?.id === chat.id ? 'bg-muted' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {chat.customer?.full_name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm truncate">
                          {chat.customer?.full_name || 'Unknown'}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(chat.updated_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {chat.last_message || 'No messages yet'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(chat.status)}
                        {(chat.unread_count ?? 0) > 0 && (
                          <Badge className="bg-red-500 h-5 px-1.5">
                            {chat.unread_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </ScrollArea>
        </Card>

        <Card className="col-span-2 flex flex-col h-[600px]">
          {selectedChat ? (
            <>
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>
                      {selectedChat.customer?.full_name?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{selectedChat.customer?.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPhone(selectedChat.customer?.phone) || selectedChat.customer?.email || selectedChat.customer?.employee_id}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedChat.status)}
                  {selectedChat.status !== 'resolved' && (
                    <Button variant="outline" size="sm" onClick={resolveChat}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Resolve
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => confirmDelete(selectedChat.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <ScrollArea className="flex-1 p-4">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    No messages yet
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map(msg => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] p-3 rounded-2xl ${
                            msg.sender_type === 'admin'
                              ? 'bg-primary text-primary-foreground rounded-br-sm'
                              : 'bg-muted rounded-bl-sm'
                          }`}
                        >
                          {msg.image_url && (
                            <a href={msg.image_url} target="_blank" rel="noopener noreferrer" className="block mb-2">
                              <img
                                src={msg.image_url}
                                alt="Shared image"
                                className="max-w-full rounded-lg max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              />
                            </a>
                          )}
                          {msg.latitude && msg.longitude && (
                            <a
                              href={`https://www.google.com/maps?q=${msg.latitude},${msg.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center gap-2 p-2 rounded-lg mb-2 hover:opacity-80 transition-opacity ${
                                msg.sender_type === 'admin' ? 'bg-primary-foreground/10' : 'bg-background'
                              }`}
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <span className="text-xs">{msg.latitude.toFixed(4)}, {msg.longitude.toFixed(4)}</span>
                            </a>
                          )}
                          {msg.message && !msg.message.startsWith('📷') && !msg.message.startsWith('📍') && (
                            <p className="text-sm">{msg.message}</p>
                          )}
                          <p className={`text-xs mt-1 ${
                            msg.sender_type === 'admin' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                          }`}>
                            {formatTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {selectedChat.status !== 'resolved' && (
                <div className="p-4 border-t">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      disabled={sending}
                    />
                    <Button onClick={sendMessage} disabled={sending || !newMessage.trim()}>
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a chat to start responding</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>

    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Chat</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this chat? This will permanently delete all messages in this conversation. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteChat}
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
