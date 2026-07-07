"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export function SupportChatListener() {
  const supabase = createClient()
  const pathname = usePathname()

  useEffect(() => {
    // Request notification permission on mount
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    console.log('SupportChatListener: Setting up subscription, pathname:', pathname)

    const channel = supabase
      .channel('support_chat_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_chat_messages'
        },
        async (payload) => {
          console.log('SupportChatListener: Received message:', payload)

          // Don't show notification if already on support chat page
          if (pathname === '/dashboard/support-chat') {
            console.log('SupportChatListener: On support chat page, skipping notification')
            return
          }

          const newMessage = payload.new as {
            sender_type?: string
            message?: string
            chat_id?: string
          }

          // Only notify for messages from customers/drivers (not admin replies)
          if (newMessage && (newMessage.sender_type === 'customer' || newMessage.sender_type === 'driver')) {
            // Get sender name
            let customerName = newMessage.sender_type === 'driver' ? 'Driver' : 'Customer'
            try {
              const { data: chat } = await supabase
                .from('support_chats')
                .select('customer:profiles!support_chats_customer_id_fkey(full_name)')
                .eq('id', newMessage.chat_id)
                .single()

              const customer = Array.isArray(chat?.customer) ? chat.customer[0] : chat?.customer
              if (customer?.full_name) {
                customerName = customer.full_name
              }
            } catch (e) {
              // Ignore fetch errors
            }

            // Show toast notification - clicking anywhere navigates to support chat
            toast.info(`💬 New support message`, {
              duration: 10000,
              description: `${customerName}: ${newMessage.message?.slice(0, 50)}${(newMessage.message?.length || 0) > 50 ? '...' : ''}`,
              action: {
                label: "View",
                onClick: () => window.location.href = "/dashboard/support-chat"
              }
            })

            // Play notification sound
            try {
              const audio = new Audio('/notification.mp3')
              audio.volume = 0.5
              audio.play().catch((err) => {
                console.log('Audio play blocked:', err)
              })
            } catch (err) {
              console.log('Audio error:', err)
            }

            // Show browser notification when on different tab
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              const notif = new Notification(`💬 Support message from ${customerName}`, {
                body: newMessage.message?.slice(0, 100) || 'New message',
                icon: '/myride-icon.png',
              })
              notif.onclick = () => {
                window.focus()
                window.location.href = '/dashboard/support-chat'
              }
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('SupportChatListener: Subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('SupportChatListener: Ready to receive messages!')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, pathname])

  return null
}
