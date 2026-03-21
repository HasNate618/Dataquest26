import Link from "next/link";

const AsteroidSVG = () => (
  <svg viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg">
    <polygon points="50,5 80,20 95,50 75,75 40,75 10,55 15,25" />
    <circle cx="35" cy="35" r="6" fill="#333" />
    <circle cx="62" cy="52" r="4" fill="#333" />
    <circle cx="55" cy="25" r="3" fill="#333" />
  </svg>
);

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background layers */}
      <div className="stars-layer stars-small" />
      <div className="stars-layer stars-medium" />
      <div className="scanlines" />

      {/* Asteroids */}
      <div className="asteroid asteroid-1"><AsteroidSVG /></div>
      <div className="asteroid asteroid-2"><AsteroidSVG /></div>
      <div className="asteroid asteroid-3"><AsteroidSVG /></div>
      <div className="asteroid asteroid-4"><AsteroidSVG /></div>
      <div className="asteroid asteroid-5"><AsteroidSVG /></div>

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen items-center justify-center px-6 text-center">
        {/* Label */}
        <p className="font-mono text-m text-gray-500 mb-16 tracking-widest uppercase">
          DATAQUEST 26
        </p>

        {/* Main heading — large */}
        <h1
          className="font-pixel text-white mb-10"
          style={{ fontSize: "clamp(2rem, 6vw, 5rem)", lineHeight: "1.4" }}
        >
          MISSION:<br />
          <span className="text-gray-300">UNDERSTAND YOUR MIND</span><br />
        </h1>

        {/* Retro PRESS START */}
        <Link href="/assess" className="press-start-link">
          <span className="font-pixel press-start-text" style={{ fontSize: "clamp(2rem, 2vw, 2rem)", lineHeight: "1." }}>
            CLICK TO START
          </span>
        </Link>
      </div>
    </div>
  );
}
