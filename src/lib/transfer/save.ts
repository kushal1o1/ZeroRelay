/** Hand a finished download to the browser as a file. Must run from a user
 *  gesture on some mobile browsers, so the UI also offers a "Save" button. */
export function saveFile(file: Blob, fileName: string) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
