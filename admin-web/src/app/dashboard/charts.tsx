"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts"

export function DashboardCharts() {
  const supabase = createClient()
  const [weeklyData, setWeeklyData] = useState([
    { name: "Mon", rides: 0 },
    { name: "Tue", rides: 0 },
    { name: "Wed", rides: 0 },
    { name: "Thu", rides: 0 },
    { name: "Fri", rides: 0 },
    { name: "Sat", rides: 0 },
    { name: "Sun", rides: 0 },
  ])
  const [monthlyData, setMonthlyData] = useState([
    { name: "Jan", rides: 0 },
    { name: "Feb", rides: 0 },
    { name: "Mar", rides: 0 },
    { name: "Apr", rides: 0 },
    { name: "May", rides: 0 },
    { name: "Jun", rides: 0 },
    { name: "Jul", rides: 0 },
    { name: "Aug", rides: 0 },
    { name: "Sep", rides: 0 },
    { name: "Oct", rides: 0 },
    { name: "Nov", rides: 0 },
    { name: "Dec", rides: 0 },
  ])
  const [quarterlyData, setQuarterlyData] = useState([
    { name: "Q1", rides: 0 },
    { name: "Q2", rides: 0 },
    { name: "Q3", rides: 0 },
    { name: "Q4", rides: 0 },
  ])
  const [yearlyData, setYearlyData] = useState<{ name: string; rides: number }[]>([])
  const [statusData, setStatusData] = useState([
    { name: "Completed", value: 0, color: "#22c55e" },
    { name: "Cancelled", value: 0, color: "#ef4444" },
    { name: "In Progress", value: 0, color: "#facc15" },
  ])
  const [hourlyData, setHourlyData] = useState([
    { hour: "6AM", rides: 0 },
    { hour: "7AM", rides: 0 },
    { hour: "8AM", rides: 0 },
    { hour: "9AM", rides: 0 },
    { hour: "10AM", rides: 0 },
    { hour: "11AM", rides: 0 },
    { hour: "12PM", rides: 0 },
    { hour: "1PM", rides: 0 },
    { hour: "2PM", rides: 0 },
    { hour: "3PM", rides: 0 },
    { hour: "4PM", rides: 0 },
    { hour: "5PM", rides: 0 },
    { hour: "6PM", rides: 0 },
    { hour: "7PM", rides: 0 },
    { hour: "8PM", rides: 0 },
  ])

  useEffect(() => {
    loadChartData()
  }, [])

  const loadChartData = async () => {
    const { data: rides } = await supabase
      .from("rides")
      .select("status, created_at")

    if (!rides || rides.length === 0) return

    // Weekly data
    const weekly = [0, 0, 0, 0, 0, 0, 0]
    const monthly = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const quarterly = [0, 0, 0, 0]
    const yearly: Record<number, number> = {}
    const hourly: Record<number, number> = {}

    let completed = 0, cancelled = 0, inProgress = 0

    rides.forEach(ride => {
      const date = new Date(ride.created_at)
      const dayIndex = date.getDay()
      const monthIndex = date.getMonth()
      const year = date.getFullYear()
      const quarter = Math.floor(monthIndex / 3)

      weekly[dayIndex]++
      monthly[monthIndex]++
      quarterly[quarter]++
      yearly[year] = (yearly[year] || 0) + 1

      const hour = date.getHours()
      hourly[hour] = (hourly[hour] || 0) + 1

      if (ride.status === "completed") completed++
      else if (ride.status === "cancelled") cancelled++
      else inProgress++
    })

    setWeeklyData([
      { name: "Mon", rides: weekly[1] },
      { name: "Tue", rides: weekly[2] },
      { name: "Wed", rides: weekly[3] },
      { name: "Thu", rides: weekly[4] },
      { name: "Fri", rides: weekly[5] },
      { name: "Sat", rides: weekly[6] },
      { name: "Sun", rides: weekly[0] },
    ])

    setMonthlyData([
      { name: "Jan", rides: monthly[0] },
      { name: "Feb", rides: monthly[1] },
      { name: "Mar", rides: monthly[2] },
      { name: "Apr", rides: monthly[3] },
      { name: "May", rides: monthly[4] },
      { name: "Jun", rides: monthly[5] },
      { name: "Jul", rides: monthly[6] },
      { name: "Aug", rides: monthly[7] },
      { name: "Sep", rides: monthly[8] },
      { name: "Oct", rides: monthly[9] },
      { name: "Nov", rides: monthly[10] },
      { name: "Dec", rides: monthly[11] },
    ])

    setQuarterlyData([
      { name: "Q1", rides: quarterly[0] },
      { name: "Q2", rides: quarterly[1] },
      { name: "Q3", rides: quarterly[2] },
      { name: "Q4", rides: quarterly[3] },
    ])

    const yearlyArr = Object.entries(yearly)
      .map(([year, rides]) => ({ name: year, rides }))
      .sort((a, b) => parseInt(a.name) - parseInt(b.name))
    setYearlyData(yearlyArr.length > 0 ? yearlyArr : [{ name: new Date().getFullYear().toString(), rides: 0 }])

    setStatusData([
      { name: "Completed", value: completed, color: "#22c55e" },
      { name: "Cancelled", value: cancelled, color: "#ef4444" },
      { name: "In Progress", value: inProgress, color: "#facc15" },
    ])

    setHourlyData([
      { hour: "6AM", rides: hourly[6] || 0 },
      { hour: "7AM", rides: hourly[7] || 0 },
      { hour: "8AM", rides: hourly[8] || 0 },
      { hour: "9AM", rides: hourly[9] || 0 },
      { hour: "10AM", rides: hourly[10] || 0 },
      { hour: "11AM", rides: hourly[11] || 0 },
      { hour: "12PM", rides: hourly[12] || 0 },
      { hour: "1PM", rides: hourly[13] || 0 },
      { hour: "2PM", rides: hourly[14] || 0 },
      { hour: "3PM", rides: hourly[15] || 0 },
      { hour: "4PM", rides: hourly[16] || 0 },
      { hour: "5PM", rides: hourly[17] || 0 },
      { hour: "6PM", rides: hourly[18] || 0 },
      { hour: "7PM", rides: hourly[19] || 0 },
      { hour: "8PM", rides: hourly[20] || 0 },
    ])
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Ride Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="weekly">
            <TabsList className="mb-4">
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
              <TabsTrigger value="yearly">Yearly</TabsTrigger>
            </TabsList>
            <TabsContent value="weekly">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" stroke="#888" />
                  <YAxis stroke="#888" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f1f1f", border: "1px solid #333" }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rides"
                    stroke="#facc15"
                    fill="#facc15"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </TabsContent>
            <TabsContent value="monthly">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" stroke="#888" />
                  <YAxis stroke="#888" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f1f1f", border: "1px solid #333" }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rides"
                    stroke="#facc15"
                    fill="#facc15"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </TabsContent>
            <TabsContent value="quarterly">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={quarterlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" stroke="#888" />
                  <YAxis stroke="#888" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f1f1f", border: "1px solid #333" }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rides"
                    stroke="#facc15"
                    fill="#facc15"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </TabsContent>
            <TabsContent value="yearly">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={yearlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" stroke="#888" />
                  <YAxis stroke="#888" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f1f1f", border: "1px solid #333" }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rides"
                    stroke="#facc15"
                    fill="#facc15"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ride Status Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "#1f1f1f", border: "1px solid #333" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2">
            {statusData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-muted-foreground">{entry.name}</span>
                <span className="font-medium">{entry.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Peak Hours Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="hour" stroke="#888" />
              <YAxis stroke="#888" />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f1f1f", border: "1px solid #333" }}
                labelStyle={{ color: "#fff" }}
              />
              <Bar dataKey="rides" fill="#facc15" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
