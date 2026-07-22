"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Clock, ChevronUp, ChevronDown } from "lucide-react"

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

  const incrementHour = () => {
    const newHour = hour12 === 12 ? 1 : hour12 + 1
    handleHourChange(newHour)
  }

  const decrementHour = () => {
    const newHour = hour12 === 1 ? 12 : hour12 - 1
    handleHourChange(newHour)
  }

  const incrementMinute = () => {
    const newMinute = (minute + 15) % 60
    handleMinuteChange(newMinute)
  }

  const decrementMinute = () => {
    const newMinute = minute === 0 ? 45 : minute - 15
    handleMinuteChange(newMinute)
  }

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
      <PopoverContent className="w-auto p-4" align="start">
        <div className="flex items-center gap-3">
          {/* Hour Spinner */}
          <div className="flex flex-col items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={incrementHour}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <div className="h-14 w-14 flex items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-2xl font-semibold tabular-nums">
                {hour12.toString().padStart(2, "0")}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={decrementHour}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>

          <span className="text-2xl font-semibold text-muted-foreground">:</span>

          {/* Minute Spinner */}
          <div className="flex flex-col items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={incrementMinute}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <div className="h-14 w-14 flex items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-2xl font-semibold tabular-nums">
                {minute.toString().padStart(2, "0")}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={decrementMinute}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>

          {/* AM/PM Toggle */}
          <div className="flex flex-col gap-1 ml-2">
            <Button
              variant={!isPM ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-9 w-12 text-xs font-medium",
                !isPM && "bg-primary text-primary-foreground"
              )}
              onClick={() => handlePeriodChange(false)}
            >
              AM
            </Button>
            <Button
              variant={isPM ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-9 w-12 text-xs font-medium",
                isPM && "bg-primary text-primary-foreground"
              )}
              onClick={() => handlePeriodChange(true)}
            >
              PM
            </Button>
          </div>
        </div>

        {/* Quick presets */}
        <div className="mt-4 pt-3 border-t flex gap-2 flex-wrap justify-center">
          {[
            { label: "6 AM", value: "06:00" },
            { label: "9 AM", value: "09:00" },
            { label: "12 PM", value: "12:00" },
            { label: "6 PM", value: "18:00" },
            { label: "10 PM", value: "22:00" },
          ].map((preset) => (
            <Button
              key={preset.value}
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-3 hover:bg-primary/10"
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
