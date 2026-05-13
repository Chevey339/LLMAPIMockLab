type ClipboardTarget = {
  writeText(text: string): Promise<void>;
};

type LegacyTextArea = {
  value: string;
  readOnly: boolean;
  style: Record<string, string>;
  select(): void;
};

type LegacyDocument = {
  body: {
    appendChild(node: LegacyTextArea): void;
    removeChild(node: LegacyTextArea): void;
  };
  createElement(tagName: "textarea"): LegacyTextArea;
  execCommand(command: "copy"): boolean;
};

type CopyDeps = {
  clipboard?: ClipboardTarget;
  document?: LegacyDocument;
};

export async function copyText(text: string, deps: CopyDeps = {}): Promise<"clipboard" | "fallback"> {
  const clipboard = deps.clipboard ?? globalThis.navigator?.clipboard;
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return "clipboard";
    } catch {
      // Fall through to the legacy path. Some deployments are plain HTTP or blocked by permissions.
    }
  }

  const legacyDocument = deps.document ?? legacyDocumentFromGlobal();
  if (!legacyDocument) throw new Error("Copy is not available in this browser");

  const textarea = legacyDocument.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";

  legacyDocument.body.appendChild(textarea);
  try {
    textarea.select();
    if (!legacyDocument.execCommand("copy")) throw new Error("Copy command failed");
    return "fallback";
  } finally {
    legacyDocument.body.removeChild(textarea);
  }
}

function legacyDocumentFromGlobal(): LegacyDocument | undefined {
  const doc = globalThis.document;
  if (!doc?.body || typeof doc.execCommand !== "function") return undefined;
  return doc as unknown as LegacyDocument;
}
