import { Select } from "@base-ui/react/select"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

interface SelectFieldOption {
  label: string
  value: string
}

interface SelectFieldProps {
  "aria-label": string
  className?: string
  disabled?: boolean
  id?: string
  onValueChange: (value: string) => void
  options: readonly SelectFieldOption[]
  value: string
}

function SelectField({
  "aria-label": ariaLabel,
  className,
  disabled,
  id,
  onValueChange,
  options,
  value,
}: SelectFieldProps) {
  return (
    <Select.Root
      disabled={disabled}
      id={id}
      items={options}
      onValueChange={(nextValue) => {
        if (nextValue !== null) onValueChange(nextValue)
      }}
      value={value}
    >
      <Select.Trigger
        aria-label={ariaLabel}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[popup-open]:bg-muted/50",
          className
        )}
        data-slot="select-trigger"
      >
        <Select.Value className="min-w-0 truncate text-left" />
        <Select.Icon className="shrink-0 text-muted-foreground">
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          align="start"
          alignItemWithTrigger={false}
          className="z-[60] outline-none"
          sideOffset={4}
        >
          <Select.Popup
            className="min-w-[var(--anchor-width)] origin-[var(--transform-origin)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none transition-[scale,opacity] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
            data-slot="select-popup"
          >
            <Select.List className="max-h-[min(18rem,var(--available-height))] overflow-y-auto">
              {options.map((option) => (
                <Select.Item
                  className="grid cursor-default grid-cols-[1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[selected]:font-medium"
                  key={option.value}
                  value={option.value}
                >
                  <Select.ItemText className="truncate">
                    {option.label}
                  </Select.ItemText>
                  <Select.ItemIndicator>
                    <Check aria-hidden="true" className="size-3.5" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

export { SelectField, type SelectFieldOption }
