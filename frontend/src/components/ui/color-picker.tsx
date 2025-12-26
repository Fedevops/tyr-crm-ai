import * as React from "react"
import { cn } from "@/lib/utils"

interface ColorPickerProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

const ColorPicker = React.forwardRef<HTMLInputElement, ColorPickerProps>(
  ({ className, label, ...props }, ref) => {
    return (
      <div className="flex items-center gap-3">
        {label && (
          <label className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            type="color"
            ref={ref}
            className={cn(
              "h-12 w-24 cursor-pointer rounded-md border border-input bg-background transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
            {...props}
          />
        </div>
      </div>
    )
  }
)
ColorPicker.displayName = "ColorPicker"

export { ColorPicker }


