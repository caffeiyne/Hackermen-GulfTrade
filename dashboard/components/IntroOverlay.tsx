"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

export function IntroOverlay() {
  const [show, setShow] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Only show once per session
    const seen = sessionStorage.getItem("intro_played");
    if (!seen) {
      setShow(true);
      sessionStorage.setItem("intro_played", "1");
    }
  }, []);

  // Fallback: hide after 5 seconds even if video event doesn't fire
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => setShow(false), 5000);
    return () => clearTimeout(timer);
  }, [show]);

  const handleVideoEnd = () => {
    // Small delay before fading for a clean finish
    setTimeout(() => setShow(false), 300);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
        >
          <video
            ref={videoRef}
            src="/intro.webm"
            autoPlay
            muted
            playsInline
            onEnded={handleVideoEnd}
            className="max-w-[80vw] max-h-[80vh] object-contain"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
