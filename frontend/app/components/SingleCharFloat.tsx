"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

interface CharProps {
  id: number;
  size: number;
  duration: number;
  startAngle: number;
  spinDelta: number;
  // Absolute pixel positions for start/mid/end
  fromX: string;
  fromY: string;
  midX: string;
  midY: string;
  toX: string;
  toY: string;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function generateChar(id: number): CharProps {
  const size = Math.round(randomBetween(20, 55));
  const duration = randomBetween(8, 22);
  const startAngle = Math.round(randomBetween(0, 360));
  const spinDelta = (Math.random() > 0.5 ? 1 : -1) * randomBetween(90, 400);

  // Pick a random edge: 0=left, 1=right, 2=top, 3=bottom
  const edge = Math.floor(Math.random() * 4);

  // Random positions along the opposite axis
  const across = `${Math.round(randomBetween(10, 90))}vw`;
  const acrossVh = `${Math.round(randomBetween(5, 90))}vh`;

  let fromX: string, fromY: string, toX: string, toY: string;
  let midX: string, midY: string;

  const drift = `${Math.round(randomBetween(-80, 80))}px`;

  switch (edge) {
    case 0: // left → right
      fromX = `-${size + 20}px`; fromY = acrossVh;
      toX = `calc(100vw + ${size + 20}px)`; toY = acrossVh;
      midX = "50vw"; midY = `calc(${acrossVh} + ${drift})`;
      break;
    case 1: // right → left
      fromX = `calc(100vw + ${size + 20}px)`; fromY = acrossVh;
      toX = `-${size + 20}px`; toY = acrossVh;
      midX = "50vw"; midY = `calc(${acrossVh} + ${drift})`;
      break;
    case 2: // top → bottom
      fromX = across; fromY = `-${size + 20}px`;
      toX = across; toY = `calc(100vh + ${size + 20}px)`;
      midX = `calc(${across} + ${drift})`; midY = "50vh";
      break;
    default: // bottom → top
      fromX = across; fromY = `calc(100vh + ${size + 20}px)`;
      toX = across; toY = `-${size + 20}px`;
      midX = `calc(${across} + ${drift})`; midY = "50vh";
      break;
  }

  return { id, size, duration, startAngle, spinDelta, fromX, fromY, midX, midY, toX, toY };
}

export default function SingleCharFloat() {
  const [char, setChar] = useState<CharProps | null>(null);
  const idRef = useRef(0);

  const spawnNext = useCallback((delayMs?: number) => {
    const delay = delayMs ?? randomBetween(55000, 70000);
    setTimeout(() => {
      idRef.current += 1;
      setChar(generateChar(idRef.current));
    }, delay);
  }, []);

  useEffect(() => {
    spawnNext(randomBetween(55000, 70000));
  }, [spawnNext]);

  if (!char) return null;

  const endAngle = char.startAngle + char.spinDelta;
  const midAngle = char.startAngle + char.spinDelta * 0.5;
  const animName = `char-single-${char.id}`;

  const keyframes = `
    @keyframes ${animName} {
      0%   { left: ${char.fromX}; top: ${char.fromY}; transform: rotate(${char.startAngle}deg); }
      45%  { left: ${char.midX};  top: ${char.midY};  transform: rotate(${midAngle}deg); }
      100% { left: ${char.toX};   top: ${char.toY};   transform: rotate(${endAngle}deg); }
    }
  `;

  return (
    <>
      <style>{keyframes}</style>
      <div
        key={char.id}
        style={{
          position: "fixed",
          width: `${char.size}px`,
          pointerEvents: "none",
          zIndex: 1,
          opacity: randomBetween(0.5, 0.9),
          animation: `${animName} ${char.duration}s linear forwards`,
          imageRendering: "pixelated",
        }}
        onAnimationEnd={() => spawnNext()}
      >
        <Image
          src="/Adobe Express - file.png"
          alt=""
          width={char.size}
          height={char.size}
          style={{ width: "100%", height: "auto" }}
        />
      </div>
    </>
  );
}
