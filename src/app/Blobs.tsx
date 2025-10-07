"use client";

import { useMemo } from "react";

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

type CSSVars = React.CSSProperties & { [key: string]: string | number };

export default function Blobs() {
  const configs = useMemo(
    () => [
      {
        className: "blob blob--pink",
        style: {
          ["--dx"]: `${rand(-20, 20)}%`,
          ["--dy"]: `${rand(-20, 20)}%`,
          ["--scale"]: `${rand(1, 1.3)}`,
          ["--duration"]: `${rand(14, 22)}s`,
        } as CSSVars,
      },
      {
        className: "blob blob--purple",
        style: {
          ["--dx"]: `${rand(-25, 25)}%`,
          ["--dy"]: `${rand(-25, 25)}%`,
          ["--scale"]: `${rand(1, 1.4)}`,
          ["--duration"]: `${rand(16, 24)}s`,
        } as CSSVars,
      },
      {
        className: "blob blob--blue",
        style: {
          ["--dx"]: `${rand(-15, 15)}%`,
          ["--dy"]: `${rand(-15, 15)}%`,
          ["--scale"]: `${rand(1, 1.35)}`,
          ["--duration"]: `${rand(12, 20)}s`,
        } as CSSVars,
      },
    ],
    []
  );

  return (
    <div className="blobs" aria-hidden="true">
      {configs.map((c, i) => (
        <div key={i} className={c.className} style={c.style} />
      ))}
    </div>
  );
}


