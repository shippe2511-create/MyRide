import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { userId, email, newPassword } = await request.json()

    if (!email || !newPassword) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })

    if (listError) {
      console.error("List users error:", listError)
      return NextResponse.json({ error: "Failed to find user" }, { status: 500 })
    }

    const authUser = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (!authUser) {
      // User doesn't exist in auth - create them
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: newPassword,
        email_confirm: true,
      })

      if (createError) {
        console.error("Create user error:", createError)
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, created: true })
    }

    // User exists - update password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      authUser.id,
      { password: newPassword }
    )

    if (updateError) {
      console.error("Update password error:", updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Reset password error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
