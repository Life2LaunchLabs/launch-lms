// The slice of Bun's test runner these render tests use, so they typecheck without bun-types.
/* eslint-disable no-unused-vars */
declare module 'bun:test' {
  type Body = () => void | Promise<void>
  interface Matchers {
    not: Matchers
    toBe(expected: unknown): void
    toEqual(expected: unknown): void
    toContain(expected: unknown): void
    toHaveLength(length: number): void
    toBeLessThan(expected: number): void
    toMatchSnapshot(): void
  }
  export function test(name: string, body: Body): void
  export function describe(name: string, body: () => void): void
  export function beforeAll(body: Body): void
  export function afterAll(body: Body): void
  export function expect(value: unknown): Matchers
  export function setSystemTime(now?: Date): void
}
