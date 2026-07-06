/**
 * Copy text to the clipboard, with a fallback for insecure contexts.
 *
 * `navigator.clipboard` only exists in a secure context (https or localhost).
 * When the app is opened over a plain-http LAN IP (common when testing P2P
 * across devices), it's undefined — so we fall back to a hidden <textarea> +
 * execCommand("copy"), which still works there. Returns whether it succeeded.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
