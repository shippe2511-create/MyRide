"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Car, Loader2, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get("error")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const supabase = createClient()

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      toast.error("Please enter your email address")
      return
    }
    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        toast.error(error.message)
      } else {
        toast.success("Password reset link sent to your email")
        setResetMode(false)
      }
    } catch {
      toast.error("An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast.error(error.message)
        setLoading(false)
        return
      }

      if (data.user) {
        // First try to find profile by auth user ID
        let { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, role, status")
          .eq("id", data.user.id)
          .single()

        console.log("Profile by ID:", profile, "Error:", profileError)

        if (!profile) {
          // Try to find by email instead
          const { data: profileByEmail, error: emailError } = await supabase
            .from("profiles")
            .select("id, role, status")
            .eq("email", data.user.email)
            .single()

          console.log("Profile by email:", profileByEmail, "Error:", emailError)

          if (profileByEmail) {
            // Profile exists with different ID - use it as-is
            profile = profileByEmail
          }
        }

        if (!profile) {
          // No profile exists - deny access (don't auto-create)
          toast.error("No admin profile found. Contact administrator.")
          await supabase.auth.signOut()
          setLoading(false)
          return
        }

        console.log("Final profile:", profile)

        if (!["super_admin", "admin", "manager", "operator"].includes(profile.role)) {
          console.log("Role check failed. Role:", profile.role)
          toast.error("Access denied. Admin privileges required.")
          await supabase.auth.signOut()
          setLoading(false)
          return
        }

        if (profile.status === "suspended") {
          toast.error("Your account has been disabled. Contact administrator.")
          await supabase.auth.signOut()
          setLoading(false)
          return
        }

        if (profile.status !== "approved") {
          toast.error("Your account is pending approval")
          await supabase.auth.signOut()
          setLoading(false)
          return
        }

        toast.success("Welcome back!")
        router.push("/dashboard")
      }
    } catch {
      toast.error("An error occurred")
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Car className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">MyRide Admin</CardTitle>
          <CardDescription>
            Enter your credentials to access the admin panel
          </CardDescription>
          {error === "unauthorized" && (
            <p className="text-sm text-destructive">
              Access denied. Admin privileges required.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {resetMode ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@macl.aero"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setResetMode(false)}
              >
                Back to Sign in
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@macl.aero"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setResetMode(true)}
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
