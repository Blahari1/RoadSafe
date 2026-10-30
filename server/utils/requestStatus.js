// Mechanic-driven status transitions. Each transition lists the status the
// request must currently be in and the timestamp field to record.
const MECHANIC_TRANSITIONS = {
  in_progress: { from: "accepted", timestampField: "startedAt" },
  completed: { from: "in_progress", timestampField: "completedAt" },
};

const getMechanicTransition = (targetStatus) =>
  Object.prototype.hasOwnProperty.call(MECHANIC_TRANSITIONS, targetStatus)
    ? MECHANIC_TRANSITIONS[targetStatus]
    : null;

module.exports = { MECHANIC_TRANSITIONS, getMechanicTransition };
