import { useEffect, useState } from "react";
import { Database, Loader2 } from "lucide-react";
import {
  OPERATION_FINISHED_EVENT,
  OPERATION_STARTED_EVENT,
  OperationFinishedDetail,
  OperationStartedDetail,
} from "../../lib/operationProgress";

type ActiveOperation = OperationStartedDetail & { startedAt: number };

export function OperationProgressOverlay() {
  const [operations, setOperations] = useState<ActiveOperation[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const handleStarted = (event: Event) => {
      const { id, label } = (event as CustomEvent<OperationStartedDetail>).detail;
      setOperations((current) => [
        ...current.filter((operation) => operation.id !== id),
        { id, label, startedAt: Date.now() },
      ]);
    };

    const handleFinished = (event: Event) => {
      const { id } = (event as CustomEvent<OperationFinishedDetail>).detail;
      setOperations((current) => current.filter((operation) => operation.id !== id));
    };

    window.addEventListener(OPERATION_STARTED_EVENT, handleStarted);
    window.addEventListener(OPERATION_FINISHED_EVENT, handleFinished);
    return () => {
      window.removeEventListener(OPERATION_STARTED_EVENT, handleStarted);
      window.removeEventListener(OPERATION_FINISHED_EVENT, handleFinished);
    };
  }, []);

  useEffect(() => {
    if (operations.length === 0) {
      setElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => {
      const oldestStart = Math.min(...operations.map((operation) => operation.startedAt));
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - oldestStart) / 1000)));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [operations]);

  if (operations.length === 0) return null;

  const current = operations[operations.length - 1];

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-label={`${current.label} in progress`}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="px-6 pb-5 pt-6">
          <div className="mb-5 flex items-center gap-4">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Database className="h-5 w-5" />
              <Loader2 className="absolute -right-1 -top-1 h-4 w-4 animate-spin rounded-full bg-background text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">{current.label}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Please keep this page open while eFAS processes the data.
              </p>
            </div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="efas-operation-progress-bar h-full w-2/5 rounded-full bg-primary" />
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Processing securely</span>
            <span>{elapsedSeconds < 2 ? "Starting…" : `${elapsedSeconds}s elapsed`}</span>
          </div>
        </div>
        <div className="border-t border-border bg-muted/30 px-6 py-3 text-[11px] leading-relaxed text-muted-foreground">
          Large sheets may take a few minutes. This window will close automatically when processing finishes.
        </div>
      </div>
    </div>
  );
}
