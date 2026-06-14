"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

interface Toast {
  id: number;
  type: "ok" | "error" | "info";
  msg: string;
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let n = 0;
    function onToast(e: Event) {
      const { type, msg } = (e as CustomEvent).detail as { type: Toast["type"]; msg: string };
      const id = ++n;
      setToasts((t) => [...t, { id, type, msg }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
    }
    window.addEventListener("cg-toast", onToast as EventListener);
    return () => window.removeEventListener("cg-toast", onToast as EventListener);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={`pointer-events-auto rounded-lg border px-4 py-2.5 text-sm shadow-lg backdrop-blur ${
              t.type === "ok"
                ? "border-emerald-700 bg-emerald-500/15 text-emerald-200"
                : t.type === "error"
                  ? "border-rose-800 bg-rose-500/15 text-rose-200"
                  : "border-zinc-700 bg-zinc-800/80 text-zinc-200"
            }`}
          >
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
