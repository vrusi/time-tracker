// Wrap bare GitLab issue/work-item/merge-request URLs in Slack's <URL|text> hyperlink format.
// e.g. "https://gitlab.x/foo/-/work_items/6506" → "<https://gitlab.x/foo/-/work_items/6506|#6506>"
// Merge requests render as "!<iid>", matching GitLab's own notation.
export function renderForSlack(text: string): string {
  return text.replace(
    /https?:\/\/\S+?\/-\/(issues|work_items|merge_requests)\/(\d+)/g,
    (url, kind, iid) => `<${url}|${kind === 'merge_requests' ? '!' : '#'}${iid}>`
  )
}
