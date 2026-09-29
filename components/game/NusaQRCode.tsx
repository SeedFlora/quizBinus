"use client";

import { useMemo } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/cn";
import { ProductMark } from "@/components/brand/Wordmark";

interface Matrix {
  size: number;
  get: (x: number, y: number) => boolean;
}

function buildMatrix(value: string): Matrix | null {
  try {
    // "Q" error correction leaves room for the centre mark without hurting scans.
    const qr = QRCode.create(value, { errorCorrectionLevel: "Q" });
    const { size, data } = qr.modules;
    return { size, get: (x, y) => Boolean(data[y * size + x]) };
  } catch {
    return null;
  }
}

const isFinder = (x: number, y: number, n: number) =>
  (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

/**
 * Real, scannable QR styled in the NUSA language: rounded modules, finder eyes drawn
 * as NUSA FRAMES, and the product mark in the centre. Dark-on-light for scan contrast.
 */
export function NusaQRCode({
  value,
  size = 280,
  className,
  label,
}: {
  value: string;
  /** px number or any CSS length (e.g. "clamp(200px, 30vh, 400px)"). */
  size?: number | string;
  className?: string;
  label: string;
}) {
  const matrix = useMemo(() => buildMatrix(value), [value]);

  if (!matrix) {
    return (
      <div
        className={cn("nf nf-lg nf-kapas grid place-items-center", className)}
        style={{ width: size, height: size }}
        role="img"
        aria-label={label}
      />
    );
  }

  const n = matrix.size;
  const quiet = 2;
  const vb = n + quiet * 2;
  const centre = Math.floor(n / 2);
  const hole = Math.ceil(n * 0.11);

  const modules: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!matrix.get(x, y) || isFinder(x, y, n)) continue;
      if (Math.abs(x - centre) <= hole && Math.abs(y - centre) <= hole) continue;
      const px = x + quiet + 0.08;
      const py = y + quiet + 0.08;
      modules.push(
        `M${px + 0.25} ${py}h0.34a0.25 0.25 0 0 1 0.25 0.25v0.34a0.25 0.25 0 0 1 -0.25 0.25h-0.34a0.25 0.25 0 0 1 -0.25 -0.25v-0.34a0.25 0.25 0 0 1 0.25 -0.25z`,
      );
    }
  }

  const eye = (x: number, y: number) => {
    const ox = x + quiet;
    const oy = y + quiet;
    // outer frame (7x7) with the NUSA cut, inner 3x3 core
    return (
      <g key={`${x}-${y}`}>
        <path
          fillRule="evenodd"
          d={`M${ox + 1} ${oy} H${ox + 5.6} L${ox + 7} ${oy + 1.4} V${oy + 5.2} Q${ox + 7} ${oy + 7} ${ox + 5.2} ${oy + 7} H${ox} V${oy + 1} Q${ox} ${oy} ${ox + 1} ${oy} Z
             M${ox + 1.6} ${oy + 1} H${ox + 5.2} L${ox + 6} ${oy + 1.8} V${oy + 5} Q${ox + 6} ${oy + 6} ${ox + 5} ${oy + 6} H${ox + 1} V${oy + 1.6} Q${ox + 1} ${oy + 1} ${ox + 1.6} ${oy + 1} Z`}
        />
        <rect x={ox + 2} y={oy + 2} width="3" height="3" rx="0.7" />
      </g>
    );
  };

  return (
    <div
      className={cn("nf nf-lg nf-kapas relative inline-grid place-items-center p-3", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg
        viewBox={`0 0 ${vb} ${vb}`}
        width="100%"
        height="100%"
        shapeRendering="geometricPrecision"
        aria-hidden="true"
      >
        <g fill="var(--binus-blue-950)">
          <path d={modules.join("")} />
          {eye(0, 0)}
          {eye(n - 7, 0)}
          {eye(0, n - 7)}
        </g>
      </svg>
      <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
        <span className="block w-[15%]">
          <ProductMark size={48} className="h-auto w-full" />
        </span>
      </span>
    </div>
  );
}
