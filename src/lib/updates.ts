const ASSET = /\/assets\/index-[^"']+\.js/

const loaded = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src.match(ASSET)?.[0]

export async function hasNewVersion(): Promise<boolean> {
  if (!loaded) return false
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text()
    const latest = html.match(ASSET)?.[0]
    return !!latest && latest !== loaded
  } catch {
    return false
  }
}
