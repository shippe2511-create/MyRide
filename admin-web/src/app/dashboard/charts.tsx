"use client"

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

const ridesData = [
  { name: "Mon", rides: 24 },
  { name: "Tue", rides: 35 },
  { name: "Wed", rides: 28 },
  { name: "Thu", rides: 42 },
  { name: "Fri", rides: 38 },
  { name: "Sat", rides: 15 },
  { name: "Sun", rides: 12 },
]

const monthlyData = [
  { name: "Jan", rides: 420 },
  { name: "Feb", rides: 380 },
  { name: "Mar", rides: 510 },
  { name: "Apr", rides: 480 },
  { name: "May", rides: 620 },
  { name: "Jun", rides: 580 },
]

const statusData = [
  { name: "Completed", value: 850, color: "#22c55e" },
  { name: "Cancelled", value: 45, color: "#ef4444" },
  { name: "In Progress", value: 12, color: "#facc15" },
]

const hourlyData = [
  { hour: "6AM", rides: 5 },
  { hour: "7AM", rides: 18 },
  { hour: "8AM", rides: 35 },
  { hour: "9AM", rides: 28 },
  { hour: "10AM", rides: 15 },
  { hour: "11AM", rides: 12 },
  { hour: "12PM", rides: 22 },
  { hour: "1PM", rides: 20 },
  { hour: "2PM", rides: 18 },
  { hour: "3PM", rides: 15 },
  { hour: "4PM", rides: 28 },
  { hour: "5PM", rides: 42 },
  { hour: "6PM", rides: 38 },
  { hour: "7PM", rides: 25 },
  { hour: "8PM", rides: 12 },
]

export function DashboardCharts() {
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
            </TabsList>
            <TabsContent value="weekly">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={ridesData}>
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
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ride Status Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
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
