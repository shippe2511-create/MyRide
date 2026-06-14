"use client"

import * as React from "react"
import { Check, ChevronDown, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
  allowCustom = true,
}: ComboboxInputProps) {
  const [open, setOpen] = React.useState(false)
  const [showCustomInput, setShowCustomInput] = React.useState(false)
  const [customValue, setCustomValue] = React.useState("")

  const selectedOption = options.find((option) => option.value === value)

  const handleAddCustom = () => {
    if (customValue.trim()) {
      onChange(customValue.trim().toLowerCase())
      setCustomValue("")
      setShowCustomInput(false)
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-10 px-3 border-input bg-background hover:bg-accent hover:text-accent-foreground"
        >
          {value ? (
            <span className="capitalize">{selectedOption?.label || value}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." className="h-9" />
          <CommandList>
            <CommandEmpty>No option found.</CommandEmpty>
            {allowCustom && (
              <CommandGroup>
                {showCustomInput ? (
                  <div className="flex items-center gap-2 p-2">
                    <Input
                      value={customValue}
                      onChange={(e) => setCustomValue(e.target.value)}
                      placeholder="Enter custom category..."
                      className="h-8"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleAddCustom()
                        }
                      }}
                      autoFocus
                    />
                    <Button size="sm" className="h-8" onClick={handleAddCustom}>
                      Add
                    </Button>
                  </div>
                ) : (
                  <CommandItem
                    onSelect={() => setShowCustomInput(true)}
                    className="cursor-pointer text-primary"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add new category
                  </CommandItem>
                )}
                <CommandSeparator className="my-1" />
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(currentValue) => {
                    onChange(currentValue)
                    setOpen(false)
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
