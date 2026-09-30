import { useEffect, useRef, useState } from "react";

export type VideoPlayerOptions = { durations: Record<string, number> };

export function useVideoPlayer({ durations }: VideoPlayerOptions) {
  const keys = Object.keys(durations);
  const [currentScene, setCurrentScene] = useState(0);
  const sceneRef = useRef(0);
  const firstPassStopped = useRef(false);

  useEffect(() => {
    window.startRecording?.();
    let timer: number | undefined;
    const advance = () => {
      const next = sceneRef.current + 1;
      if (next >= keys.length) {
        if (!firstPassStopped.current) {
          firstPassStopped.current = true;
          window.stopRecording?.();
        }
        sceneRef.current = 0;
        setCurrentScene(0);
      } else {
        sceneRef.current = next;
        setCurrentScene(next);
      }
      timer = window.setTimeout(advance, durations[keys[sceneRef.current]]);
    };
    timer = window.setTimeout(advance, durations[keys[0]]);
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [durations, keys]);

  return { currentScene };
}