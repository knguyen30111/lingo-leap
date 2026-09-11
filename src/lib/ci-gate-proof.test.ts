import { describe, expect, it } from 'vitest'

describe('ci gate red proof', () => {
  it('fails on purpose so the CI gate can be shown to block', () => {
    expect(1).toBe(2)
  })
})
