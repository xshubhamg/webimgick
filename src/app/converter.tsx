"use client";
/* eslint-disable @next/next/no-img-element -- Blob URLs are local previews and must not use the image optimizer. */

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Download, FileImage, ImagePlus, Link2, Link2Off, LoaderCircle, LockKeyhole, RefreshCcw, RotateCcw, ShieldCheck, Sparkles, Trash2, UploadCloud, X } from "lucide-react";

type Format = "webp" | "jpeg" | "png" | "avif";
type SourceImage = { file: File; url: string; width: number; height: number };
type ResultImage = { blob: Blob; url: string; width: number; height: number; stale: boolean; downloaded: boolean };

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const qualityDefaults: Record<Format, number> = { webp: 82, jpeg: 85, avif: 60, png: 100 };
const formatLabels: Record<Format, string> = { webp: "WebP", jpeg: "JPEG", png: "PNG", avif: "AVIF" };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function loadDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = url;
  });
}

export default function Converter() {
  const root = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceRef = useRef<SourceImage | null>(null);
  const resultRef = useRef<ResultImage | null>(null);
  const [source, setSourceState] = useState<SourceImage | null>(null);
  const [result, setResultState] = useState<ResultImage | null>(null);
  const [format, setFormat] = useState<Format>("webp");
  const [qualities, setQualities] = useState(qualityDefaults);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [locked, setLocked] = useState(true);
  const [background, setBackground] = useState("#ffffff");
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const setSource = (value: SourceImage | null) => { sourceRef.current = value; setSourceState(value); };
  const setResult = (value: ResultImage | null | ((current: ResultImage | null) => ResultImage | null)) => {
    const next = typeof value === "function" ? value(resultRef.current) : value;
    resultRef.current = next;
    setResultState(next);
  };

  useEffect(() => {
    let active = true;
    let context: { revert: () => void } | undefined;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && root.current) {
      import("gsap").then(({ gsap }) => {
        if (!active || !root.current) return;
        context = gsap.context(() => {
          gsap.fromTo(
            "[data-reveal]",
            { y: 18, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.7, stagger: 0.08, ease: "power3.out" }
          );
        }, root);
      });
    }
    return () => {
      active = false;
      context?.revert();
    };
  }, []);

  useEffect(() => () => {
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
    if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    abortRef.current?.abort();
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    if (!processing) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [processing]);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5200);
  };

  const invalidate = () => setResult((current) => current ? { ...current, stale: true } : current);

  const acceptFile = async (file?: File) => {
    if (!file) return;
    if (!allowedTypes.includes(file.type)) return notify("Choose a JPEG, PNG, WebP, or AVIF image.");
    if (file.size > MAX_BYTES) return notify("That image is larger than the 4 MB limit.");
    if (result && !result.downloaded && !window.confirm("Replace this image before downloading the current result?")) return;
    abortRef.current?.abort();
    setProcessing(false);
    const url = URL.createObjectURL(file);
    try {
      const dimensions = await loadDimensions(url);
      if (dimensions.width > 12_000 || dimensions.height > 12_000 || dimensions.width * dimensions.height > MAX_PIXELS) {
        URL.revokeObjectURL(url);
        return notify("Images are limited to 40 megapixels and 12,000 pixels per side.");
      }
      if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
      setSource({ file, url, ...dimensions });
      setWidth(String(dimensions.width));
      setHeight(String(dimensions.height));
      setLocked(true);
      setResult(null);
    } catch {
      URL.revokeObjectURL(url);
      notify("The selected image could not be read.");
    }
  };

  const setDimension = (axis: "width" | "height", value: string) => {
    if (value && !/^\d*$/.test(value)) return;
    invalidate();
    if (axis === "width") {
      setWidth(value);
      if (locked && source && value) setHeight(String(Math.min(source.height, Math.max(1, Math.round(Number(value) * source.height / source.width)))));
    } else {
      setHeight(value);
      if (locked && source && value) setWidth(String(Math.min(source.width, Math.max(1, Math.round(Number(value) * source.width / source.height)))));
    }
  };

  const dimensionError = (() => {
    if (!source) return null;
    const w = width ? Number(width) : undefined;
    const h = height ? Number(height) : undefined;
    return (w && (!Number.isInteger(w) || w < 1 || w > source.width)) || (h && (!Number.isInteger(h) || h < 1 || h > source.height))
      ? `Use whole pixels up to ${source.width} × ${source.height}.` : null;
  })();

  const convert = async () => {
    if (!source || dimensionError) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setElapsed(0);
    setProcessing(true);
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    const data = new FormData();
    data.set("file", source.file); data.set("format", format); data.set("quality", String(qualities[format]));
    data.set("width", width); data.set("height", height); data.set("background", background);
    try {
      const response = await fetch("/api/convert", { method: "POST", body: data, signal: controller.signal });
      if (!response.ok) {
        const error = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(error?.error || "Conversion failed. Try again.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const dimensions = await loadDimensions(url);
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
      setResult({ blob, url, ...dimensions, stale: false, downloaded: false });
      if (window.innerWidth < 768) requestAnimationFrame(() => document.querySelector("#comparison")?.scrollIntoView({ behavior: "smooth" }));
    } catch (error) {
      if (controller.signal.aborted) notify(elapsed >= 59 ? "Conversion timed out. Try smaller dimensions or WebP." : "Conversion cancelled.");
      else notify(error instanceof Error ? error.message : "Conversion failed. Try again.");
    } finally {
      clearTimeout(timeout); setProcessing(false); if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const resetDimensions = () => {
    if (!source) return;
    setWidth(String(source.width)); setHeight(String(source.height)); setLocked(true); invalidate();
  };

  const startOver = () => {
    abortRef.current?.abort();
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
    if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    setSource(null); setResult(null); setWidth(""); setHeight(""); setLocked(true); setProcessing(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const download = () => {
    if (!source || !result || result.stale) return;
    const base = source.file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-") || "image";
    const anchor = document.createElement("a");
    anchor.href = result.url; anchor.download = `${base}-converted.${format === "jpeg" ? "jpg" : format}`; anchor.click();
    setResult({ ...result, downloaded: true });
  };

  const statusText = elapsed < 2 ? "Validating image" : elapsed < 5 ? "Converting pixels" : "Preparing download";
  const sizeIncreased = !!result && result.blob.size > (source?.file.size ?? 0);

  return (
    <div ref={root} className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="site-header" data-reveal>
        <a className="brand" href="#top"><span className="brand-mark"><Sparkles size={18} /></span><span>Webimgick</span></a>
        <div className="privacy-pill"><LockKeyhole size={14} /> Files are never stored</div>
      </header>

      <main id="top" className="main-content">
        <section className="hero" data-reveal>
          <div className="eyebrow"><span /> ON-DEMAND IMAGE LAB</div>
          <h1>Convert clean.<br /><em>Keep every pixel yours.</em></h1>
          <p>Precision format conversion without accounts, clutter, or permanent uploads.</p>
        </section>

        <section className="workspace" aria-label="Image converter">
          <div className="workspace-grid">
            <section className="panel upload-panel" data-reveal aria-labelledby="upload-title">
              <div className="panel-heading"><div><span className="step">01</span><h2 id="upload-title">Source image</h2></div>{source && <button className="text-button danger" onClick={startOver}><Trash2 size={14} /> Start over</button>}</div>
              <input ref={fileInput} type="file" className="sr-only" accept={allowedTypes.join(",")} onChange={(e) => acceptFile(e.target.files?.[0])} />
              <button className={`dropzone ${dragging ? "is-dragging" : ""} ${source ? "has-file" : ""}`} onClick={() => fileInput.current?.click()}
                onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
                onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files[0]); }}>
                {source ? <><div className="mini-preview checkerboard"><img src={source.url} alt="Selected source" /></div><div className="file-copy"><strong>{source.file.name}</strong><span>{source.width} × {source.height} px · {formatBytes(source.file.size)}</span><small><RefreshCcw size={12} /> Drop or click to replace</small></div><span className="ready-badge"><Check size={12} /> READY</span></>
                  : <><span className="upload-icon"><UploadCloud size={27} /></span><strong>Drop an image into the lab</strong><span>or click to browse your device</span><small>JPEG · PNG · WEBP · AVIF &nbsp; / &nbsp; MAX 4 MB</small></>}
              </button>
              <p className="privacy-note"><ShieldCheck size={15} /> Processed securely on demand. Never retained.</p>
            </section>

            <section className="panel controls-panel" data-reveal aria-labelledby="settings-title">
              <div className="panel-heading"><div><span className="step">02</span><h2 id="settings-title">Output settings</h2></div><span className="settings-status">{source ? "CONFIGURE" : "AWAITING IMAGE"}</span></div>
              <fieldset disabled={!source || processing}>
                <div className="field-group"><label htmlFor="format">Target format</label><div className="select-wrap"><select id="format" value={format} onChange={(e) => { setFormat(e.target.value as Format); invalidate(); }}><option value="webp">WebP — best for web</option><option value="jpeg">JPEG — universal</option><option value="png">PNG — lossless</option><option value="avif">AVIF — smallest</option></select><ChevronDown size={16} /></div></div>
                {format !== "png" && <div className="field-group quality-field"><div className="label-row"><label htmlFor="quality">Quality</label><output htmlFor="quality">{qualities[format]}%</output></div><input id="quality" type="range" min="1" max="100" value={qualities[format]} style={{ "--range-progress": `${qualities[format]}%` } as React.CSSProperties} onChange={(e) => { setQualities({ ...qualities, [format]: Number(e.target.value) }); invalidate(); }} /><div className="range-labels"><span>SMALLER</span><span>CRISPER</span></div></div>}
                <div className="field-group"><div className="label-row"><label>Resize bounds</label><button className="text-button" type="button" onClick={resetDimensions}><RotateCcw size={13} /> Reset original</button></div><div className="dimension-row"><label><span>WIDTH</span><div><input inputMode="numeric" value={width} onChange={(e) => setDimension("width", e.target.value)} aria-label="Width in pixels" /><b>PX</b></div></label><button type="button" className={`link-toggle ${locked ? "active" : ""}`} onClick={() => setLocked(!locked)} aria-label={`${locked ? "Unlock" : "Lock"} aspect ratio`} aria-pressed={locked}>{locked ? <Link2 size={17} /> : <Link2Off size={17} />}</button><label><span>HEIGHT</span><div><input inputMode="numeric" value={height} onChange={(e) => setDimension("height", e.target.value)} aria-label="Height in pixels" /><b>PX</b></div></label></div>{dimensionError && <p className="field-error">{dimensionError}</p>}<p className="field-hint">Fits inside bounds · Never upscales</p></div>
                {format === "jpeg" && <div className="field-group"><label htmlFor="background">Transparency background</label><div className="color-field"><input type="color" value={background} onChange={(e) => { setBackground(e.target.value); invalidate(); }} aria-label="Choose JPEG background color" /><input id="background" value={background.toUpperCase()} maxLength={7} onChange={(e) => { setBackground(e.target.value); invalidate(); }} /></div><p className="field-hint">JPEG cannot preserve transparent pixels.</p></div>}
              </fieldset>
              {processing ? (
                <div className="processing-box" aria-live="polite">
                  <div>
                    <LoaderCircle className="spin" size={19} />
                    <span>
                      <strong>{statusText}</strong>
                      <small>{elapsed}s elapsed</small>
                    </span>
                  </div>
                  <button onClick={() => abortRef.current?.abort()}>Cancel</button>
                </div>
              ) : !source ? (
                <button
                  className="convert-button"
                  onClick={() => fileInput.current?.click()}
                >
                  <ImagePlus size={18} /> Select Image to Convert <ArrowRight size={18} />
                </button>
              ) : result && !result.stale ? (
                <div className="action-buttons-row">
                  <button
                    className="convert-button secondary"
                    onClick={convert}
                    disabled={!!dimensionError}
                  >
                    <RefreshCcw size={15} /> Convert Again
                  </button>
                  <button className="download-button-primary" onClick={download}>
                    <Download size={17} /> Download {formatLabels[format]}
                  </button>
                </div>
              ) : (
                <button
                  className="convert-button"
                  disabled={!!dimensionError}
                  onClick={convert}
                >
                  <Sparkles size={18} /> Convert to {formatLabels[format]} <ArrowRight size={18} />
                </button>
              )}
            </section>
          </div>

          <section id="comparison" className="comparison" data-reveal aria-labelledby="preview-title">
            <div className="comparison-heading"><div><span className="step">03</span><h2 id="preview-title">Pixel check</h2></div><div className="size-flow" aria-live="polite"><span>{source ? formatBytes(source.file.size) : "—"}</span><ArrowRight size={15} /><strong className={sizeIncreased ? "is-larger" : ""}>{result ? formatBytes(result.blob.size) : "—"}</strong>{sizeIncreased && <small>LARGER THAN ORIGINAL</small>}</div></div>
            <div className="preview-grid">
              <article className="preview-card"><div className="preview-label"><span>ORIGINAL</span>{source && <small>{source.file.type.split("/")[1]?.toUpperCase()}</small>}</div><div className="preview-stage checkerboard">{source ? <img src={source.url} alt="Original preview" /> : <div className="empty-preview"><ImagePlus size={27} /><span>Your original will appear here</span></div>}</div><div className="preview-meta"><span>{source ? `${source.width} × ${source.height} px` : "No image selected"}</span><strong>{source ? formatBytes(source.file.size) : "—"}</strong></div></article>
              <div className="compare-arrow"><ArrowRight size={18} /></div>
              <article className={`preview-card result-card ${result?.stale ? "is-stale" : ""}`}><div className="preview-label"><span>CONVERTED</span>{result && <small>{formatLabels[format].toUpperCase()}</small>}</div><div className="preview-stage checkerboard" style={format === "jpeg" ? { backgroundColor: background, backgroundImage: "none" } : undefined}>{result ? <><img src={result.url} alt="Converted preview" />{result.stale && <div className="stale-overlay"><RefreshCcw size={22} /><span>Settings changed</span><small>Convert again to update</small></div>}</> : processing ? <div className="skeleton-preview"><span /><span /><span /></div> : <div className="empty-preview"><FileImage size={27} /><span>Your conversion will appear here</span></div>}</div><div className="preview-meta"><span>{result ? `${result.width} × ${result.height} px` : "Awaiting conversion"}</span><strong>{result ? formatBytes(result.blob.size) : "—"}</strong></div>{result && !result.stale && <button className="download-button" onClick={download}><Download size={17} /> Download {formatLabels[format]}</button>}</article>
            </div>
          </section>
        </section>
      </main>
      <footer data-reveal><span>WEBIMGICK / 2026</span><p>Processed securely on demand · 4 MB limit · JPEG, PNG, WebP, AVIF</p><span>NO STORAGE</span></footer>
      <div className={`toast ${toast ? "show" : ""}`} role="alert" aria-live="assertive"><X size={17} /><span>{toast}</span><button onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={14} /></button></div>
    </div>
  );
}
