import { describe, expect, it } from 'vitest'
import { ProductResearchSchema } from '@shared/models'
import { canonicalUrl, collectSources, verifyExtract } from '../src/main/services/research'

const NOW = '2026-11-02T10:00:00.000Z'

// Shapes as the API returns them for server-side web search / fetch.
const blocks = [
  { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'Dewline Gentle Hydrating Cleanser ingredients' } },
  {
    type: 'web_search_tool_result',
    tool_use_id: 's1',
    content: [
      { type: 'web_search_result', url: 'https://dewline.example/cleanser#ingredients', title: 'Gentle Hydrating Cleanser – Dewline', encrypted_content: 'xx', page_age: null },
      { type: 'web_search_result', url: 'https://pubmed.ncbi.nlm.nih.gov/12345/', title: 'Niacinamide and sebum', encrypted_content: 'xx', page_age: null }
    ]
  },
  { type: 'web_fetch_tool_result', tool_use_id: 'f1', content: { type: 'web_fetch_result', url: 'https://www.aad.org/cleansers/', content: { type: 'document' } } },
  // results Claude filtered with code still carry their URLs, nested deeper
  { type: 'code_execution_tool_result', tool_use_id: 'c1', content: { stdout: '', results: [{ url: 'https://ec.europa.eu/cosing/glycerin', title: 'CosIng – Glycerin' }] } },
  { type: 'text', text: 'Some notes mention https://made-up.example/study', citations: [{ type: 'web_search_result_location', url: 'https://pubmed.ncbi.nlm.nih.gov/12345', title: 'Niacinamide and sebum', cited_text: '…', encrypted_index: 'x' }] }
]

describe('research sources', () => {
  it('normalises URLs and rejects non-web ones', () => {
    expect(canonicalUrl('https://a.example/x/#frag')).toBe('https://a.example/x')
    expect(canonicalUrl('javascript:alert(1)')).toBeNull()
    expect(canonicalUrl('not a url')).toBeNull()
  })

  it('collects only URLs the search and fetch tools returned', () => {
    const s = collectSources(blocks)
    expect([...s.keys()].sort()).toEqual(['https://dewline.example/cleanser', 'https://ec.europa.eu/cosing/glycerin', 'https://pubmed.ncbi.nlm.nih.gov/12345', 'https://www.aad.org/cleansers'])
    expect(s.get('https://pubmed.ncbi.nlm.nih.gov/12345')).toBe('Niacinamide and sebum')
    // a URL that only appears in Claude's own prose is not a source
    expect(s.has('https://made-up.example/study')).toBe(false)
  })

  it('drops findings whose source was not in the results', () => {
    const r = verifyExtract(
      {
        ingredientsText: 'Aqua, Glycerin, Niacinamide',
        ingredientsUrl: 'https://dewline.example/cleanser',
        ingredientsCheck: 'match',
        differences: [],
        findings: [
          { ingredient: 'Niacinamide', finding: 'Reduced sebum in a small trial.', kind: 'peer_reviewed', url: 'https://pubmed.ncbi.nlm.nih.gov/12345/' },
          { ingredient: 'Glycerin', finding: 'Cures acne.', kind: 'peer_reviewed', url: 'https://made-up.example/study' }
        ]
      },
      collectSources(blocks),
      NOW
    )
    expect(ProductResearchSchema.safeParse(r.research).success).toBe(true)
    expect(r.research.findings).toHaveLength(1)
    expect(r.research.findings[0]).toMatchObject({ ingredient: 'Niacinamide', source: { url: 'https://pubmed.ncbi.nlm.nih.gov/12345', title: 'Niacinamide and sebum' } })
    expect(r.research.ingredientSource?.title).toBe('Gentle Hydrating Cleanser – Dewline')
    expect(r.ingredientsText).toBe('Aqua, Glycerin, Niacinamide')
  })

  it('refuses an ingredient list without a real source', () => {
    const r = verifyExtract({ ingredientsText: 'Aqua, Glycerin', ingredientsUrl: 'https://made-up.example/list', ingredientsCheck: 'differs', differences: ['x'], findings: [] }, collectSources(blocks), NOW)
    expect(r.ingredientsText).toBeNull()
    expect(r.research).toMatchObject({ ingredientSource: null, ingredientsCheck: 'not_found', differences: [] })
  })
})
