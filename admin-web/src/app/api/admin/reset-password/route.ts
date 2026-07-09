import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    // Verify caller is authenticated super-admin
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is super-admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "super-admin") {
      return NextResponse.json({ error: "Forbidden - super-admin access required" }, { status: 403 })
    }

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
      // First, get the existing profile to preserve data
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("email", email)
        .single()

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: newPassword,
        email_confirm: true,
      })

      if (createError) {
        console.error("Create user error:", createError)
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }

      // If profile existed with different ID, update it to use the new auth user ID
      if (existingProfile && newUser?.user && existingProfile.id !== newUser.user.id) {
        // Delete old profile and create new one with correct ID
        await supabaseAdmin.from("profiles").delete().eq("id", existingProfile.id)
        await supabaseAdmin.from("profiles").upsert({
          id: newUser.user.id,
          full_name: existingProfile.full_name,
          email: existingProfile.email,
          phone: existingProfile.phone,
          role: existingProfile.role,
          status: existingProfile.status,
          employee_id: existingProfile.employee_id,
          department: existingProfile.department,
          avatar_url: existingProfile.avatar_url,
          custom_permissions: existingProfile.custom_permissions,
          created_at: existingProfile.created_at,
          updated_at: new Date().toISOString(),
        })
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
