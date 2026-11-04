import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useTheme } from 'styled-components'
import { theme } from '../design-system'
import { queryClient as defaultClient } from '../lib/queryClient'
import { AppProviders } from './AppProviders'

let seen: { client?: QueryClient; theme?: unknown } = {}
function Probe() {
  seen = { client: useQueryClient(), theme: useTheme() }
  return <p>Content</p>
}

it('renders children with the provided query client and the design theme', () => {
  const client = new QueryClient()
  render(
    <AppProviders client={client}>
      <Probe />
    </AppProviders>,
  )
  expect(screen.getByText('Content')).toBeVisible()
  expect(seen.client).toBe(client)
  expect(seen.theme).toBe(theme)
})

it('falls back to the shared application query client', () => {
  render(
    <AppProviders>
      <Probe />
    </AppProviders>,
  )
  expect(seen.client).toBe(defaultClient)
})
