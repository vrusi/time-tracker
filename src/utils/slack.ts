// Wrap bare GitLab issue/work-item URLs in Slack's <URL|text> hyperlink format.
// e.g. "https://gitlab.x/foo/-/work_items/6506" → "<https://gitlab.x/foo/-/work_items/6506|#6506>"
export function renderForSlack(text: string): string {
  return text.replace(
    /https?:\/\/\S+?\/-\/(?:issues|work_items)\/(\d+)/g,
    (url, iid) => `<${url}|#${iid}>`
  )
}
