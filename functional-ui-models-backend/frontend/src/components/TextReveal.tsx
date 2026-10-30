import { useEffect, useMemo, useRef, useState } from "react";

const TEXT =
  "Every verdict here is an *estimate,* not proof. When the detectors hesitate, the lens says *uncertain* instead of pretending to know.";

/** Scroll-synced word reveal: opacity 0.15 → 1 as the paragraph crosses the viewport. */
export function TextReveal() {
  const words = useMemo(
    () =>
      TEXT.split(" ").map((w) => ({
        text: w.replace(/\*/g, ""),
        accent: w.startsWith("*"),
      })),
    [],
  );
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the top enters at 85% of the viewport, 1 when the bottom reaches 45%.
      const start = vh * 0.85;
      const end = vh * 0.45;
      const total = rect.height + (start - end);
      const progress = Math.min(Math.max((start - rect.top) / total, 0), 1);
      setActive(Math.round(progress * words.length));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [words.length]);

  return (
    <section className="section" aria-label="How to read the results">
      <div className="container">
        <span className="label">On honesty</span>
        <p ref={ref} className="text-reveal" style={{ marginTop: 24 }} aria-label={TEXT.replace(/\*/g, "")}>
          {words.map((w, i) => (
            <span key={i} aria-hidden="true" className={`${i < active ? "is-on" : ""} ${w.accent ? "accent" : ""}`}>
              {w.text}{" "}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
