const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const htmlPath = path.resolve(__dirname, "Documento_Tecnico_Atualizador_ERP.html");
const outputPath = path.resolve(__dirname, "Documento_Tecnico_Atualizador_ERP.pdf");
const html = fs.readFileSync(htmlPath, "utf8");
const blocks = [];
const matcher = /<(h1|h2|h3|p|li|th|td)[^>]*>([\s\S]*?)<\/\1>/gi;
let match;
while ((match = matcher.exec(html))) {
  const value = clean(match[2]);
  if (value) blocks.push({ type: match[1].toLowerCase(), value });
}

const doc = new PDFDocument({ size: "A4", margins: { top: 58, bottom: 58, left: 58, right: 58 }, bufferPages: true });
doc.info.Title = "Atualizador Inteligente de ERP - Documento Técnico";
doc.info.Author = "Gestor de Atualizações";
doc.pipe(fs.createWriteStream(outputPath));

for (const block of blocks) {
  if (block.type === "h1") {
    doc.moveDown(1.2).font("Helvetica-Bold").fontSize(24).fillColor("#1d4058").text(block.value, { lineGap: 5 });
    doc.moveDown(0.5).strokeColor("#3c9bc9").lineWidth(2).moveTo(58, doc.y).lineTo(150, doc.y).stroke();
    doc.moveDown(0.8);
  } else if (block.type === "h2") {
    doc.moveDown(0.9).font("Helvetica-Bold").fontSize(16).fillColor("#1d4058").text(block.value, { lineGap: 3 });
    doc.moveDown(0.25).strokeColor("#3c9bc9").lineWidth(1).moveTo(58, doc.y).lineTo(535, doc.y).stroke();
    doc.moveDown(0.35);
  } else if (block.type === "h3") {
    doc.moveDown(0.55).font("Helvetica-Bold").fontSize(12.5).fillColor("#238f82").text(block.value);
    doc.moveDown(0.15);
  } else if (block.type === "li") {
    doc.font("Helvetica").fontSize(10.5).fillColor("#24323a").text(`•  ${block.value}`, { indent: 12, hanging: 8, lineGap: 2 });
    doc.moveDown(0.12);
  } else if (block.type === "th") {
    doc.font("Helvetica-Bold").fontSize(9.2).fillColor("#1d4058").text(block.value, { continued: true });
    doc.text("  |  ", { continued: true });
  } else if (block.type === "td") {
    doc.font("Helvetica").fontSize(9.2).fillColor("#24323a").text(block.value, { lineGap: 1 });
    doc.moveDown(0.08);
  } else {
    doc.font("Helvetica").fontSize(10.5).fillColor("#24323a").text(block.value, { align: "justify", lineGap: 3 });
    doc.moveDown(0.25);
  }
}

const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  doc.font("Helvetica").fontSize(8).fillColor("#71807a").text(`Gestor de Atualizações  |  Documento Técnico  |  ${i + 1}/${range.count}`, 58, 785, { align: "center", width: 479 });
}
doc.end();

function clean(value) {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">" ).replace(/\s+/g, " ").trim();
}
