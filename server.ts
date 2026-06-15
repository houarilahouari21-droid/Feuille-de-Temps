import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import puppeteer from "puppeteer";

const app = express();
const PORT = 3000;

// Allow large payloads for HTML content
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve API routes first
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Single API endpoint to generate high-fidelity PDFs from HTML contents using Puppeteer
app.post("/api/generate-pdf", async (req, res) => {
  let browser;
  try {
    const { htmls, filename } = req.body;
    if (!htmls || !Array.isArray(htmls)) {
      return res.status(400).json({ error: "Missing HTML content array 'htmls'" });
    }

    // Launch server-side Puppeteer chromium engine safely
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();
    
    // Set viewport to represent print-friendly high-resolution dimension
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });

    // Build self-contained HTML page containing the layout, including standard CDN styles as fallback and direct font styling
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <script src="https://cdn.tailwindcss.com"></script>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700;800&display=swap">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700;800&display=swap');
            html, body {
              margin: 0;
              padding: 0;
              font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
              -webkit-print-color-adjust: exact;
              background-color: #f8fafc;
            }
            .page-break {
              page-break-after: always;
              break-after: page;
            }
            tr {
              page-break-inside: avoid;
              break-inside: avoid;
            }

            /* Force standard CSS colors to completely prevent modern oklab/oklch PDF rendering crashes */
            .bg-white { background-color: #ffffff !important; }
            .bg-slate-50 { background-color: #f8fafc !important; }
            .bg-slate-50\/50 { background-color: rgba(248, 250, 252, 0.5) !important; }
            .bg-slate-100 { background-color: #f1f5f9 !important; }
            .bg-indigo-50 { background-color: #e0e7ff !important; }
            .bg-indigo-50\/30 { background-color: rgba(224, 231, 255, 0.3) !important; }
            .bg-indigo-50\/50 { background-color: rgba(224, 231, 255, 0.5) !important; }
            .bg-indigo-650 { background-color: #4f46e5 !important; }
            .bg-indigo-600 { background-color: #4f46e5 !important; }
            .bg-indigo-700 { background-color: #4338ca !important; }
            .bg-indigo-700\/50 { background-color: rgba(67, 56, 202, 0.5) !important; }
            .bg-violet-50 { background-color: #f5f3ff !important; }
            .bg-violet-600 { background-color: #7c3aed !important; }
            .bg-violet-755 { background-color: #5b21b6 !important; }
            .bg-violet-700 { background-color: #6d28d9 !important; }
            .bg-teal-50 { background-color: #f0fdfa !important; }
            .bg-teal-50\/50 { background-color: rgba(240, 253, 250, 0.5) !important; }
            .bg-teal-600 { background-color: #0d9488 !important; }
            .bg-teal-650 { background-color: #0d9488 !important; }
            .bg-teal-800 { color: #115e59 !important; }
            .bg-amber-50 { background-color: #fffbeb !important; }
            .bg-amber-50\/40 { background-color: rgba(255, 251, 235, 0.4) !important; }
            .bg-amber-100 { background-color: #fef3c7 !important; }
            
            /* Safe translucent colors inside headers */
            .bg-indigo-500\/30 { background-color: rgba(99, 102, 241, 0.3) !important; }
            .bg-indigo-400\/20 { background-color: rgba(129, 140, 248, 0.2) !important; }
            .bg-violet-600\/40 { background-color: rgba(124, 58, 237, 0.4) !important; }
            .bg-violet-400\/20 { background-color: rgba(167, 139, 250, 0.2) !important; }
            
            /* Safe borders explicitly configured */
            .border-slate-100 { border-color: #f1f5f9 !important; }
            .border-slate-200 { border-color: #e2e8f0 !important; }
            .border-slate-300 { border-color: #cbd5e1 !important; }
            .border-indigo-100 { border-color: #e0e7ff !important; }
            .border-indigo-200 { border-color: #c7d2fe !important; }
            .border-indigo-400\/20 { border-color: rgba(129, 140, 248, 0.2) !important; }
            .border-indigo-750 { border-color: #4338ca !important; }
            .border-indigo-700 { border-color: #4338ca !important; }
            .border-indigo-400\/20 { border-color: rgba(129, 140, 248, 0.2) !important; }
            .border-violet-100 { border-color: #ede9fe !important; }
            .border-violet-200 { border-color: #ddd6fe !important; }
            .border-violet-400\/20 { border-color: rgba(167, 139, 250, 0.2) !important; }
            .border-teal-100 { border-color: #ccfbf1 !important; }
            .border-amber-200 { border-color: #fde68a !important; }
            .border-l-6 { border-left-width: 6px !important; border-left-style: solid !important; }
            
            /* Explicit safe text colors */
            .text-white { color: #ffffff !important; }
            .text-indigo-50 { color: #e0e7ff !important; }
            .text-indigo-100 { color: #e0e7ff !important; }
            .text-indigo-200 { color: #c7d2fe !important; }
            .text-indigo-600 { color: #4f46e5 !important; }
            .text-indigo-700 { color: #4338ca !important; }
            .text-indigo-800 { color: #3730a3 !important; }
            .text-indigo-950 { color: #1e1b4b !important; }
            .text-indigo-900 { color: #1e1b4b !important; }
            .text-slate-300 { color: #cbd5e1 !important; }
            .text-slate-400 { color: #94a3b8 !important; }
            .text-slate-500 { color: #64748b !important; }
            .text-slate-600 { color: #475569 !important; }
            .text-slate-705 { color: #334155 !important; }
            .text-slate-700 { color: #334155 !important; }
            .text-slate-800 { color: #1e293b !important; }
            .text-slate-900 { color: #0f172a !important; }
            .text-violet-650 { color: #7c3aed !important; }
            .text-violet-700 { color: #6d28d9 !important; }
            .text-teal-600 { color: #0d9488 !important; }
            .text-teal-800 { color: #115e59 !important; }
            .text-amber-800 { color: #92400e !important; }
            .text-amber-900 { color: #78350f !important; }
            .text-amber-950 { color: #451a03 !important; }
          </style>
          <script>
            tailwind.config = {
              theme: {
                extend: {
                  fontFamily: {
                    sans: ['Inter', 'sans-serif'],
                    mono: ['JetBrains Mono', 'monospace'],
                  }
                }
              }
            }
          </script>
        </head>
        <body class="bg-slate-50">
          ${htmls.map((htmlBlock, index) => {
            const isLast = index === htmls.length - 1;
            return `
              <div class="w-[297mm] min-h-[210mm] p-[10mm] box-border bg-slate-50 flex flex-col justify-between ${isLast ? '' : 'page-break'}">
                ${htmlBlock}
              </div>
            `;
          }).join("")}
        </body>
      </html>
    `;

    await page.setContent(fullHtml, { waitUntil: "networkidle0" });

    // Sleep a tiny bit to ensure typography and Tailwind finishes processing
    await new Promise(resolve => setTimeout(resolve, 600));

    // Print A4 landscape dimensions perfectly
    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px"
      }
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename || "timesheet.pdf"}"`);
    res.send(Buffer.from(pdfBuffer));

  } catch (error: any) {
    console.error("Puppeteer PDF rendering error:", error);
    res.status(500).json({ error: "Failed to generate PDF on server", details: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Configure Vite middleware or static serving
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server starting and listening on port ${PORT}`);
  });
}

setupServer();
