# 🔮 Webimgick

A premium, high-performance, developer-aesthetic image converter built with **Next.js**, **Sharp**, and **GSAP**. Powered by **Tailwind CSS v4** and themed with the elegant **Catppuccin Mocha** color palette.

Webimgick is designed to offer professional-grade image configuration (formats, sizing, quality, and backgrounds) through a beautiful glassmorphic dashboard, processing everything on-demand with zero permanent storage.

---

## ✨ Features & Interface

- **Drag-and-Drop Interface**: Immersive file drop zone with micro-interactions and instant local size/dimension detection.
- **Side-by-Side Pixel Check**: Live visual comparison layout displaying original vs. converted outputs, file size progression, and stale-state detection alerts.
- **Smart Aspect-Ratio Locking**: Dynamic aspect ratio linking that adjusts values proportionally during resize configurations.
- **Transparency Background Handling**: Automatic flat color rendering under transparent areas when converting Alpha-channel images to non-alpha formats like JPEG.
- **Responsive Fluid Layout**: Mobile-first design that auto-scrolls down to output previews on smaller devices when conversion completes.
- **Privacy First**: Fully stateless architecture. No accounts, no cookies, and no database storage. Your files are converted in memory and sent directly back as a stream.

---

## 🏗️ Architecture & Engineering Decisions

### 1. High-Performance Client-Side UX
- **GSAP Animation System**: Utilizes GreenSock (GSAP) for layout entry stagger effects (`[data-reveal]`). It respects user accessibility preferences by matching against `(prefers-reduced-motion: reduce)` before mounting, and cleans up animations via context reversion to prevent memory leaks.
- **Resource Cleanup (Anti-Leak)**: Standard web applications often suffer from browser memory bloat when using `URL.createObjectURL`. Webimgick proactively tracks and destroys references using `URL.revokeObjectURL(url)` on component unmount, files overrides, and conversions.
- **Flight Cancelling (AbortController)**: Users can cancel in-flight conversions at any time. When a request is aborted, the UI cancels the network stack request via a React-managed `AbortController` reference.

### 2. Secure & Optimized Backend Processing (`sharp`)
- **EXIF & Colorspace Normalization**: The backend calls `.autoOrient()` to fix rotated smartphone photos and converts all formats to safe standard `srgb` colorspace to ensure reliable, high-fidelity color rendering.
- **MozJPEG Compression**: JPEG exports leverage `mozjpeg: true` for advanced progressive compression, producing smaller file sizes without sacrificing detail.
- **WebP & AVIF Efficiencies**: Configured with a balanced compression effort level (`effort: 4`) ensuring minimal serverless runtime CPU usage while retaining superior image compression density.
- **Security & DDoS Defenses**:
  - **Memory Limits (Megapixel Cap)**: Restricts inputs to 40 Megapixels and 12,000px per side (`limitInputPixels`) to defend against decompressed image bomb vulnerability attacks.
  - **Content-Length Filtering**: Intercepts HTTP requests and evaluates the `Content-Length` header *before* allocating server memory to parse `multipart/form-data`, discarding payloads larger than 4MB.
  - **Serverless Buffer Ceiling**: Enforces an output buffer check of 4.45 MB to prevent serverless execution crashes from Vercel's response size limit (4.5 MB).

### 3. Resilient Rate Limiting Strategy
- **Hybrid Rate Limiter**: The API endpoint (`POST /api/convert`) features a dual-layer strategy:
  - If Upstash Redis credentials (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`) are present, it uses Redis sliding-window token buckets via `@upstash/ratelimit`.
  - If external services are offline or not configured, it seamlessly falls back to a clean in-memory map rate limiter (`localRateLimit`) on the host instance.

---

## 🛠️ Tech Stack & Environment

- **Framework**: [Next.js](https://nextjs.org/) (App Router, React 19)
- **Runtime**: Node.js
- **Package Manager**: Bun
- **Styling**: Tailwind CSS v4 & Vanilla CSS Variables
- **Animations**: GreenSock GSAP
- **Image Processing**: `sharp`
- **Icons**: `lucide-react`
- **Rate Limiting**: Upstash Redis

---

## 🚀 Getting Started

Webimgick is built to be run and managed using **Bun** for maximum runtime and dependency installation speed.

### Prerequisites

Make sure you have [Bun](https://bun.sh/) installed:
```bash
curl -fsSL https://bun.sh/install | bash
```

### Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   git clone <repository-url>
   cd webimgick
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. (Optional) Set up Upstash Redis rate limiting in a `.env` file:
   ```env
   UPSTASH_REDIS_REST_URL="your-redis-url"
   UPSTASH_REDIS_REST_TOKEN="your-redis-token"
   ```

### Running Locally

To spin up the development server:
```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to try out the dashboard.

### Build and Deploy

To create an optimized production build:
```bash
bun run build
```

---

## 📁 Repository Structure

```
├── public/                 # Static assets & icons
├── src/
│   └── app/
│       ├── api/
│       │   └── convert/
│       │       └── route.ts  # Node.js sharp-processing API with rate limiting
│       ├── converter.tsx     # Client-side workspace UI and GSAP controller
│       ├── globals.css       # Catppuccin Mocha tokens & responsive styles
│       ├── layout.tsx        # Base Next.js App Shell
│       └── page.tsx          # App entry point
├── package.json              # Project dependencies and script runner
├── tsconfig.json             # TypeScript rules configuration
└── AGENTS.md                 # Design instructions & ruleset
```

---

## 🛡️ License

This project is licensed under the MIT License - feel free to use and adapt it for your own tooling stack.
