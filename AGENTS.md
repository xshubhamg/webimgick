<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Master Design Document: Image Converter Tool

## 1. Project Overview
A high-performance, visually polished web-based image converter. The tool allows users to upload images, change formats (JPEG, PNG, WebP), resize dimensions, and adjust quality before downloading the processed result.

## 2. Technology Stack
*   **Framework:** Next.js (App Router)
*   **Styling:** Tailwind CSS v4
*   **Animations:** GSAP (GreenSock Animation Platform) for smooth transitions and interactions
*   **Image Processing Engine:** `sharp` (via Node.js)
*   **Icons:** Lucide React (or similar minimal SVG icon library)

## 3. UI/UX & Design Language
The dashboard will utilize a premium, dark-themed developer aesthetic featuring the **Catppuccin Mocha** color palette and subtle glassmorphism effects for a modern, sleek look.

### Color Palette (Catppuccin Mocha)
*   **Base/Background:** `#1e1e2e`
*   **Mantle (Cards/Dropzones):** `#181825`
*   **Text (Primary):** `#cdd6f4`
*   **Subtext:** `#a6adc8`
*   **Primary Accent (Mauve):** `#cba6f7`
*   **Secondary Accent (Blue):** `#89b4fa`
*   **Success (Green):** `#a6e3a1`
*   **Error (Red):** `#f38ba8`

### Layout & Components
1.  **Header:** Minimalist navigation bar with the project title and an optional subtle glowing effect.
2.  **Main Workspace (Split View or Stacked):**
        *   **Left/Top:** A large, inviting drag-and-drop zone. State changes (idle, dragging over, uploaded) should be animated with GSAP (e.g., subtle scaling and border color shifts).
        *   **Right/Bottom:** Configuration Panel.
            *   *Format Selection:* Styled custom dropdown (WebP, PNG, JPEG, AVIF).
            *   *Quality Slider:* Range slider (1-100) with a dynamic value display.
            *   *Resize Controls:* Width and Height number inputs, ideally with a "lock aspect ratio" toggle.
3.  **Action Area:** A prominent "Convert Image" button that transitions into a loading state during server processing.

## 4. API & Data Flow
### Endpoint: `POST /api/convert`
*   **Request:** Receives `multipart/form-data` containing the file buffer and conversion parameters (target format, width, height, quality).
*   **Processing:**
    *   Validate file size (Max 5MB to prevent serverless timeouts).
    *   Initialize `sharp(buffer)`.
    *   Apply `.resize()` if dimensions are provided.
    *   Apply `.toFormat(format, { quality })`.
*   **Response:** Returns the processed image buffer with the appropriate `Content-Type` header (e.g., `image/webp`).

## 5. Edge Cases & Constraints to Handle
*   **File Size Limits:** Strictly enforce a 5MB limit on the frontend before upload.
*   **Unsupported File Types:** Reject non-image files immediately on drag-and-drop.
*   **Serverless Cold Starts:** Add skeleton loaders or optimistic UI elements via GSAP to mask slight delays during initial API calls.
*   **Error Handling:** Display crisp, clear error toast notifications (using the Red `#f38ba8` accent) if the conversion fails.
