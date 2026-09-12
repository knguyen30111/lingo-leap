interface EditorOutputBodyProps {
  isLoading: boolean
  error: string | null
  outputText: string
  placeholder: string
  /**
   * One skeleton bar per entry. This exists only to preserve the shipped 4-bar
   * translation / 3-bar correction difference; it is not a styling knob.
   */
  skeletonWidths: readonly string[]
}

export function EditorOutputBody({
  isLoading,
  error,
  outputText,
  placeholder,
  skeletonWidths,
}: EditorOutputBodyProps) {
  // A streamed response sets the output text chunk by chunk while the request
  // is still in flight. Once the first chunk is on screen the skeleton is no
  // longer standing in for anything, so the partial text replaces it and the
  // user watches the answer arrive instead of watching bars pulse.
  const isStreaming = isLoading && outputText.trim() !== ''

  return (
    <div className="flex-1 p-4 overflow-auto">
      {isStreaming ? (
        <div
          role="status"
          aria-busy="true"
          aria-live="polite"
          className="text-[var(--text-primary)] text-base leading-relaxed whitespace-pre-wrap"
        >
          {outputText}
        </div>
      ) : isLoading ? (
        <div className="space-y-3 animate-pulse">
          {skeletonWidths.map((width) => (
            <div key={width} className={`h-4 bg-[var(--glass-bg)] rounded ${width}`}></div>
          ))}
        </div>
      ) : error ? (
        <div className="text-[var(--error)] text-sm">{error}</div>
      ) : outputText ? (
        <div className="text-[var(--text-primary)] text-base leading-relaxed whitespace-pre-wrap">
          {outputText}
        </div>
      ) : (
        <div className="text-[var(--text-tertiary)] text-sm">{placeholder}</div>
      )}
    </div>
  )
}
