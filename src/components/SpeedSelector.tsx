import { useState, useRef, useEffect, useCallback } from 'react'

interface SpeedSelectorProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  disabled?: boolean
}

const PRESET_SPEEDS = [
  { value: 0.50, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1.00, label: '1x' },
  { value: 1.25, label: '1.25x' },
  { value: 1.50, label: '1.5x' },
  { value: 2.00, label: '2x' },
]

export function SpeedSelector({
  value,
  onChange,
  min = 0.50,
  max = 2.00,
  disabled = false,
}: SpeedSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Format display value (remove trailing zeros for whole numbers)
  const formatDisplay = (val: number): string => {
    if (val === 1) return '1x'
    if (val === 2) return '2x'
    if (Number.isInteger(val)) return `${val}x`
    // Show up to 2 decimal places, remove trailing zeros
    const formatted = val.toFixed(2).replace(/\.?0+$/, '')
    return `${formatted}x`
  }

  // Validate and clamp value
  const validateValue = useCallback((val: string): number | null => {
    // Remove 'x' suffix if present
    const cleaned = val.replace(/x$/i, '').trim()
    const num = parseFloat(cleaned)

    if (isNaN(num)) return null
    if (num < min) return min
    if (num > max) return max

    // Round to 2 decimal places
    return Math.round(num * 100) / 100
  }, [min, max])

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        if (isEditing) {
          handleInputSubmit()
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isEditing, inputValue])

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleInputSubmit = () => {
    const validated = validateValue(inputValue)
    if (validated !== null && validated !== value) {
      onChange(validated)
    }
    setIsEditing(false)
    setIsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleInputSubmit()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setIsOpen(false)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newVal = Math.min(max, Math.round((value + 0.05) * 100) / 100)
      onChange(newVal)
      setInputValue(newVal.toFixed(2))
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newVal = Math.max(min, Math.round((value - 0.05) * 100) / 100)
      onChange(newVal)
      setInputValue(newVal.toFixed(2))
    }
  }

  const handlePresetClick = (presetValue: number) => {
    onChange(presetValue)
    setIsOpen(false)
    setIsEditing(false)
  }

  const handleToggleDropdown = () => {
    if (disabled) return
    if (!isOpen) {
      setIsOpen(true)
    } else if (!isEditing) {
      setIsOpen(false)
    }
  }

  const handleInputClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isEditing) {
      setInputValue(value.toFixed(2))
      setIsEditing(true)
    }
  }

  return (
    <div className="speed-selector" ref={containerRef}>
      {/* Main button/input */}
      <button
        type="button"
        className={`speed-selector-trigger ${isOpen ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={handleToggleDropdown}
        disabled={disabled}
        title="Speech speed (0.50x - 2.00x)"
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleInputSubmit}
            onClick={handleInputClick}
            className="speed-selector-input"
            placeholder="1.00"
            maxLength={4}
          />
        ) : (
          <span className="speed-selector-value" onClick={handleInputClick}>
            {formatDisplay(value)}
          </span>
        )}
        <svg
          className={`speed-selector-chevron ${isOpen ? 'open' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="speed-selector-dropdown">
          {/* Custom input section */}
          <div className="speed-selector-custom">
            <span className="speed-selector-custom-label">Custom</span>
            <div className="speed-selector-custom-input-wrapper">
              <input
                type="text"
                value={isEditing ? inputValue : value.toFixed(2)}
                onChange={(e) => {
                  setInputValue(e.target.value)
                  setIsEditing(true)
                }}
                onFocus={() => {
                  setInputValue(value.toFixed(2))
                  setIsEditing(true)
                }}
                onKeyDown={handleKeyDown}
                onBlur={handleInputSubmit}
                className="speed-selector-custom-input"
                placeholder="1.00"
                maxLength={4}
              />
              <span className="speed-selector-custom-suffix">x</span>
            </div>
          </div>

          {/* Divider */}
          <div className="speed-selector-divider" />

          {/* Presets */}
          <div className="speed-selector-presets">
            {PRESET_SPEEDS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`speed-selector-preset ${value === preset.value ? 'active' : ''}`}
                onClick={() => handlePresetClick(preset.value)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Hint */}
          <div className="speed-selector-hint">
            Range: {min}x - {max}x
          </div>
        </div>
      )}
    </div>
  )
}
