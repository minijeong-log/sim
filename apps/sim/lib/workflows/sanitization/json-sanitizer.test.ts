/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/workflows/credentials/credential-extractor', () => ({
  sanitizeWorkflowForSharing: vi.fn((state) => state),
}))

vi.mock('@/stores/workflows/workflow/utils', () => ({
  generateLoopBlocks: vi.fn(() => ({})),
  generateParallelBlocks: vi.fn(() => ({})),
}))

import { sanitizeForCopilot } from '@/lib/workflows/sanitization/json-sanitizer'
import type { WorkflowState } from '@/stores/workflows/workflow/types'

function createBlock(
  type: string,
  name: string,
  overrides: Record<string, any> = {}
): Record<string, any> {
  return {
    type,
    name,
    enabled: true,
    subBlocks: {},
    position: { x: 0, y: 0 },
    ...overrides,
  }
}

describe('sanitizeForCopilot - human-readable block keys', () => {
  it('uses "start" as key for the starter block', () => {
    const state = {
      blocks: {
        start: createBlock('starter', 'Start'),
      },
      edges: [],
      loops: {},
      parallels: {},
    } as unknown as WorkflowState

    const result = sanitizeForCopilot(state)

    expect(result.blocks).toHaveProperty('start')
    expect(result.blocks.start.type).toBe('starter')
  })

  it('uses block type as key when only one block of that type exists', () => {
    const state = {
      blocks: {
        start: createBlock('starter', 'Start'),
        'aaaa-bbbb-cccc-dddd': createBlock('agent', 'My Agent'),
        'eeee-ffff-0000-1111': createBlock('condition', 'Check Result'),
      },
      edges: [],
      loops: {},
      parallels: {},
    } as unknown as WorkflowState

    const result = sanitizeForCopilot(state)

    expect(Object.keys(result.blocks)).toEqual(
      expect.arrayContaining(['start', 'agent', 'condition'])
    )
    expect(result.blocks.agent.name).toBe('My Agent')
    expect(result.blocks.condition.name).toBe('Check Result')
  })

  it('appends 1-based index when multiple blocks share a type', () => {
    const state = {
      blocks: {
        start: createBlock('starter', 'Start'),
        'uuid-1': createBlock('agent', 'Agent A'),
        'uuid-2': createBlock('agent', 'Agent B'),
        'uuid-3': createBlock('agent', 'Agent C'),
      },
      edges: [],
      loops: {},
      parallels: {},
    } as unknown as WorkflowState

    const result = sanitizeForCopilot(state)

    expect(Object.keys(result.blocks)).toEqual(
      expect.arrayContaining(['start', 'agent_1', 'agent_2', 'agent_3'])
    )
    expect(result.blocks.agent_1.name).toBe('Agent A')
    expect(result.blocks.agent_2.name).toBe('Agent B')
    expect(result.blocks.agent_3.name).toBe('Agent C')
  })

  it('remaps connection targets to readable keys', () => {
    const state = {
      blocks: {
        start: createBlock('starter', 'Start'),
        'uuid-agent': createBlock('agent', 'My Agent'),
      },
      edges: [{ source: 'start', target: 'uuid-agent', sourceHandle: 'source' }],
      loops: {},
      parallels: {},
    } as unknown as WorkflowState

    const result = sanitizeForCopilot(state)

    expect(result.blocks.start.connections).toEqual({ source: 'agent' })
  })

  it('remaps nested node keys for loop/parallel blocks', () => {
    const state = {
      blocks: {
        start: createBlock('starter', 'Start'),
        'uuid-loop': createBlock('loop', 'My Loop', {
          data: { loopType: 'for', count: 3 },
        }),
        'uuid-child': createBlock('agent', 'Loop Agent', {
          data: { parentId: 'uuid-loop' },
        }),
      },
      edges: [{ source: 'start', target: 'uuid-loop', sourceHandle: 'source' }],
      loops: {},
      parallels: {},
    } as unknown as WorkflowState

    const result = sanitizeForCopilot(state)

    expect(result.blocks).toHaveProperty('loop')
    expect(result.blocks.loop.nestedNodes).toHaveProperty('agent')
    expect(result.blocks.loop.nestedNodes!.agent.name).toBe('Loop Agent')
  })

  it('does not include UUID keys in the output', () => {
    const state = {
      blocks: {
        start: createBlock('starter', 'Start'),
        '087b3e77-1234-5678-9abc-def012345678': createBlock('agent', 'Agent'),
        'a1b2c3d4-5678-9abc-def0-123456789abc': createBlock('function', 'Transform'),
      },
      edges: [
        {
          source: 'start',
          target: '087b3e77-1234-5678-9abc-def012345678',
          sourceHandle: 'source',
        },
        {
          source: '087b3e77-1234-5678-9abc-def012345678',
          target: 'a1b2c3d4-5678-9abc-def0-123456789abc',
          sourceHandle: 'source',
        },
      ],
      loops: {},
      parallels: {},
    } as unknown as WorkflowState

    const result = sanitizeForCopilot(state)
    const serialized = JSON.stringify(result)

    // No UUID patterns should appear in the output
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
    expect(Object.keys(result.blocks)).toEqual(
      expect.arrayContaining(['start', 'agent', 'function'])
    )
  })
})
