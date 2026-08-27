import { describe, it, expect } from 'vitest'
import { renderForSlack } from '../src/utils/slack'

describe('renderForSlack', () => {
  it('links issue and work item URLs as #<iid>', () => {
    expect(renderForSlack('https://gitlab.x/foo/-/issues/6506 | ui | thing'))
      .toBe('<https://gitlab.x/foo/-/issues/6506|#6506> | ui | thing')
    expect(renderForSlack('https://gitlab.x/foo/-/work_items/6506'))
      .toBe('<https://gitlab.x/foo/-/work_items/6506|#6506>')
  })

  it('links merge request URLs as !<iid>', () => {
    expect(renderForSlack('https://gitlab.x/foo/-/merge_requests/1234 | backend | extract service'))
      .toBe('<https://gitlab.x/foo/-/merge_requests/1234|!1234> | backend | extract service')
  })

  it('leaves text without URLs untouched', () => {
    expect(renderForSlack('#6506 | ui | thing')).toBe('#6506 | ui | thing')
  })
})
