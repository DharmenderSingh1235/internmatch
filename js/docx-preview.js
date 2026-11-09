/* Re-render a DOCX into a sandboxed frame while retaining its page layout. */
(function () {
  function safeCss(value) {
    return String(value || "")
      .replace(/@import[^;]*(?:;|$)/gi, "")
      .replace(/url\(([^)]*)\)/gi, (match, raw) => /^\s*['"]?data:/i.test(raw) ? match : "none")
      .replace(/expression\s*\([^)]*\)/gi, "")
      .replace(/(?:behavior|-moz-binding)\s*:[^;]+;?/gi, "")
      .replace(/<\s*\/\s*style/gi, "");
  }

  function sanitizeRenderedDocument(root) {
    root.querySelectorAll("script,iframe,object,embed,form,input,svg,math,video,audio,link").forEach((node) => node.remove());
    root.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value;
        if (name.startsWith("on") || name === "srcdoc") { node.removeAttribute(attribute.name); return; }
        if (name === "style") { node.setAttribute("style", safeCss(value)); return; }
        if (name === "href" && !/^(?:https?:\/\/|mailto:|#)/i.test(value)) node.removeAttribute(attribute.name);
        if ((name === "src" || name === "srcset") && !/^data:/i.test(value)) node.removeAttribute(attribute.name);
      });
    });
  }

  function makePreviewDocument(styleHtml, contentHtml) {
    const cleanedStyles = safeCss(styleHtml);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline';"><style>
      *{box-sizing:border-box}html,body{min-height:100%;margin:0}body{padding:18px;background:#e8edf4;color:#202b3e;font:14px/1.5 Arial,sans-serif}.docx-preview-wrapper{display:flex;flex-direction:column;align-items:center;gap:18px}.docx-preview{max-width:100%;box-shadow:0 5px 22px #15294a22}.docx-preview table{max-width:100%}@media(max-width:720px){body{padding:9px}.docx-preview{transform-origin:top center}}
    </style>${cleanedStyles}</head><body>${contentHtml}</body></html>`;
  }

  async function show(blob, frame) {
    if (!window.docx?.renderAsync || !blob || !frame) throw new Error("Word preview is unavailable in this browser.");
    const host = document.createElement("div");
    const content = document.createElement("div");
    const styles = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:-100000px;top:0;width:900px;visibility:hidden;pointer-events:none;";
    host.append(styles, content);
    document.body.appendChild(host);
    try {
      await window.docx.renderAsync(blob, content, styles, {
        className: "docx-preview",
        inWrapper: true,
        breakPages: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        ignoreLastRenderedPageBreak: false,
        useBase64URL: true
      });
      sanitizeRenderedDocument(host);
      const styleHtml = [...styles.querySelectorAll("style")].map((style) => `<style>${safeCss(style.textContent)}</style>`).join("");
      frame.removeAttribute("src");
      frame.setAttribute("sandbox", "");
      frame.srcdoc = makePreviewDocument(styleHtml, content.innerHTML);
    } finally {
      host.remove();
    }
  }

  window.InternMatchDocxPreview = { show };
})();
