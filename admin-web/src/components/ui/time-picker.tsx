"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Clock } from "lucide-react"

interface TimePickerProps {
  value: string // "HH:mm" format
  onChange: (value: string) => void
  className?: string
}

export function TimePicker({ value, onChange, className }: TimePickerProps) {
  const [open, setOpen] = React.useState(false)

  // Parse time value
  const parseTime = (timeStr: string) => {
    const parts = timeStr.split(":")
    let hour = parseInt(parts[0]) || 0
    const minute = parseInt(parts[1]) || 0
    const isPM = hour >= 12
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return { hour, hour12, minute, isPM }
  }

  const { hour12, minute, isPM } = parseTime(value)

  const formatDisplay = () => {
    const h = hour12.toString().padStart(2, "0")
    const m = minute.toString().padStart(2, "0")
    return `${h}:${m} ${isPM ? "PM" : "AM"}`
  }

  const handleHourChange = (newHour12: number) => {
    let hour24 = newHour12
    if (isPM && newHour12 !== 12) hour24 = newHour12 + 12
    if (!isPM && newHour12 === 12) hour24 = 0
    const newValue = `${hour24.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`
    onChange(newValue)
  }

  const handleMinuteChange = (newMinute: number) => {
    const { hour } = parseTime(value)
    const newValue = `${hour.toString().padStart(2, "0")}:${newMinute.toString().padStart(2, "0")}`
    onChange(newValue)
  }

  const handlePeriodChange = (newIsPM: boolean) => {
    let { hour } = parseTime(value)
    if (newIsPM && hour < 12) hour += 12
    if (!newIsPM && hour >= 12) hour -= 12
    const newValue = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`
    onChange(newValue)
  }

  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  const minutes = [0, 15, 30, 45]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <Clock className="mr-2 h-4 w-4" />
          {formatDisplay()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex p-3 gap-2">
          {/* Hours */}
          <div className="flex flex-col gap-1">
            <div className="text-xs text-center text-muted-foreground mb-1 font-medium">Hour</div>
            <div className="grid grid-cols-3 gap-1">
              {hours.map((h) => (
                <Button
                  key={h}
                  variant={hour12 === h ? "default" : "ghost"}
                  size="sm"
                  className="h-9 w-9"
                  onClick={() => handleHourChange(h)}
                >
                  {h}
                </Button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="w-px bg-border" />

          {/* Minutes */}
          <div className="flex flex-col gap-1">
            <div className="text-xs text-center text-muted-foreground mb-1 font-medium">Min</div>
            <div className="flex flex-col gap-1">
              {minutes.map((m) => (
                <Button
                  key={m}
                  variant={minute === m ? "default" : "ghost"}
                  size="sm"
                  className="h-9 w-12"
                  onClick={() => handleMinuteChange(m)}
                >
                  {m.toString().padStart(2, "0")}
                </Button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="w-px bg-border" />

          {/* AM/PM */}
          <div className="flex flex-col gap-1">
            <div className="text-xs text-center text-muted-foreground mb-1 font-medium">&nbsp;</div>
            <div className="flex flex-col gap-1">
              <Button
                variant={!isPM ? "default" : "ghost"}
                size="sm"
                className="h-9 w-12"
                onClick={() => handlePeriodChange(false)}
              >
                AM
              </Button>
              <Button
                variant={isPM ? "default" : "ghost"}
                size="sm"
                className="h-9 w-12"
                onClick={() => handlePeriodChange(true)}
              >
                PM
              </Button>
            </div>
          </div>
        </div>

        {/* Quick presets */}
        <div className="border-t p-2 flex gap-1 flex-wrap">
          {[
            { label: "6 AM", value: "06:00" },
            { label: "8 AM", value: "08:00" },
            { label: "12 PM", value: "12:00" },
            { label: "6 PM", value: "18:00" },
            { label: "10 PM", value: "22:00" },
          ].map((preset) => (
            <Button
              key={preset.value}
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => {
                onChange(preset.value)
                setOpen(false)
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
