/** Browser file helpers. */

export function downloadText(text: string, fileName: string, mime = "text/plain"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/\.(sqlite|pg)$/, "") || "Imported";
}

/** File-system-friendly version of a table/database name. */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "export";
}
