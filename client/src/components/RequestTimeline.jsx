import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { formatDate } from "../utils/format";

// Service progress timeline built only from timestamps the server recorded.
// Requests created before timestamps existed show "Time not recorded".
export default function RequestTimeline({ request }) {
  const status = request.status;

  const steps = [
    {
      key: "pending",
      label: "Request submitted",
      at: request.createdAt,
      reached: true,
    },
    {
      key: "accepted",
      label: "Mechanic accepted",
      at: request.acceptedAt,
      reached: ["accepted", "in_progress", "completed"].includes(status),
    },
    {
      key: "in_progress",
      label: "Service in progress",
      at: request.startedAt,
      reached: ["in_progress", "completed"].includes(status),
    },
    {
      key: "completed",
      label: "Service completed",
      at: request.completedAt,
      reached: status === "completed",
    },
  ];

  const visibleSteps =
    status === "cancelled"
      ? [
          steps[0],
          {
            key: "cancelled",
            label: "Request cancelled",
            at: request.cancelledAt,
            reached: true,
            cancelled: true,
          },
        ]
      : steps;

  return (
    <ol className="space-y-4" aria-label="Service progress">
      {visibleSteps.map((step) => {
        const Icon = step.cancelled
          ? XCircle
          : step.reached
            ? CheckCircle2
            : Circle;

        return (
          <li key={step.key} className="flex items-start gap-3">
            <Icon
              size={22}
              className={
                step.cancelled
                  ? "text-slate-500"
                  : step.reached
                    ? "text-green-600"
                    : "text-slate-300"
              }
            />
            <div>
              <p
                className={`text-sm font-semibold ${
                  step.reached ? "text-slate-900" : "text-slate-400"
                }`}
              >
                {step.label}
              </p>
              {step.reached && (
                <p className="text-xs text-slate-500">
                  {formatDate(step.at, "Time not recorded")}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
