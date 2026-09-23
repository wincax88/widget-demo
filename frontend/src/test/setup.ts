import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

const getComputedStyle = window.getComputedStyle.bind(window)
window.getComputedStyle = ((element: Element) => getComputedStyle(element)) as typeof window.getComputedStyle

afterEach(() => cleanup())
