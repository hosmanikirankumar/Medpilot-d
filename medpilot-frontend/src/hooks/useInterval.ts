import { useEffect, useRef } from 'react'

/**
 * useInterval — A declarative interval hook that handles cleanup
 * and supports dynamic delay changes (pass null to pause).
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback)

  // Keep callback ref up-to-date without resetting the interval
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    if (delay === null) return
    const id = setInterval(() => savedCallback.current(), delay)
    return () => clearInterval(id)
  }, [delay])
}
