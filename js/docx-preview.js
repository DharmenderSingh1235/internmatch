/* Render Word resumes locally in a sandboxed iframe. */
(function () {
  const allowedTags = new Set(["A", "B", "BLOCKQUOTE", "BR", "EM", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "I", "IMG", "LI", "OL", "P", "STRONG", "SUB", "SUP", "TABLE", "TBODY", "TD", "TH", "THEAD", "TR", "U", "UL"]);
  const blockedTags = new Set(["IFRAME", "OBJECT", "EMBED", "SCRIPT", "STYLE", "SVG", "MATH", "VIDEO", "AUDIO", "FORM", "INPUT"]);

  function cleanNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (blockedTags.has(tag)) { node.remove(); return; }
    [...node.children].forEach(cleanNode);
    if (!allowedTags.has(tag)) {
      node.replaceWith(...node.childNodes);
      return;
    }

    const imageSource = tag === "IMG" ? node.getAttribute("src") || "" : "";
    const imageAlt = tag === "IMG" ? node.getAttribute("alt") || "" : "";
    const link = tag === "A" ? node.getAttribute("href") || "" : "";
    [...node.attributes].forEach((attribute) => node.removeAttribute(attribute.name));
    if (tag === "IMG" && /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(imageSource)) {
      node.setAttribute("src", imageSource);
      node.setAttribute("alt", imageAlt);
      node.loading = "lazy";
    }
    if (tag === "A" && /^(?:https?:\/\/|mailto:)/i.test(link)) {
      node.setAttribute("href", link);
      node.setAttribute("rel", "noopener noreferrer");
      node.setAttribute("target", "_blank");
    }
  }

  function wrapDocument(bodyHtml) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"><style>
      *{box-sizing:border-box}body{margin:0;padding:clamp(18px,4vw,48px);background:#eef2f8;color:#202b3e;font:15px/1.65 Arial,sans-serif}.resume{width:min(850px,100%);min-height:100%;margin:0 auto;padding:clamp(24px,5vw,64px);background:#fff;box-shadow:0 4px 24px #15294a18;overflow-wrap:anywhere}h1,h2,h3,h4{color:#172746;line-height:1.25;margin:1.25em 0 .5em}h1{margin-top:0;font-size:1.8rem}h2{font-size:1.35rem}p{margin:.45em 0}ul,ol{padding-left:1.5em}li{padding-left:.2em;margin:.2em 0}table{width:100%;border-collapse:collapse;margin:1em 0}td,th{border:1px solid #dce3ee;padding:8px;text-align:left}img{max-width:100%;height:auto}a{color:#2458c7}
      @media print{body{padding:0;background:#fff}.resume{width:100%;box-shadow:none;padding:0}}
    </style></head><body><main class="resume">${bodyHtml}</main></body></html>`;
  }

  async function show(blob, frame) {
    if (!window.mammoth || !blob || !frame) throw new Error("Word preview is unavailable in this browser.");
    const { value = "" } = await window.mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
    const parsed = new DOMParser().parseFromString(`<body>${value}</body>`, "text/html");
    [...parsed.body.children].forEach(cleanNode);
    frame.removeAttribute("src");
    frame.setAttribute("sandbox", "");
    frame.srcdoc = wrapDocument(parsed.body.innerHTML || "<p>This Word document has no readable text.</p>");
  }

  window.InternMatchDocxPreview = { show };
})();
