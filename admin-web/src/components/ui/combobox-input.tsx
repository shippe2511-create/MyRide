"use client"

import * as React from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

interface ComboboxInputProps {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  allowCustom?: boolean
}

export function ComboboxInput({
  value,
  onChange,
  options,
  placeholder = "Select...",
}: ComboboxInputProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const selectedOption = options.find((option) => option.value === value)

  const filteredOptions = React.useMemo(() => {
    if (!search) return options
    const searchLower = search.toLowerCase()
    return options.filter((option) =>
      option.label.toLowerCase().includes(searchLower)
    )
  }, [options, search])

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  React.useEffect(() => {
    if (!open) {
      setSearch("")
    }
  }, [open])

  const displayValue = open ? search : (selectedOption?.label || "")

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-9 pr-8"
        />
        {value && !open && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange("")
              setSearch("")
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {!value && (
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        )}
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md">
          <div className="max-h-64 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No results found
              </div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted transition-colors",
                    value === option.value && "bg-muted"
                  )}
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100 text-primary" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
