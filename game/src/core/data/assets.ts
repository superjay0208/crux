/** Page-relative assets work at both / and a GitHub Pages project path. */
export function assetUrl(path: string): string { return new URL(path,document.baseURI).href; }
