import { STATUS_LABEL } from "../../lib/format.js";

const TONE = {
  analog: "bg-ok/15 text-ok",
  partial: "bg-warn/15 text-warn",
  not_analog: "bg-bad/15 text-bad",
  no_data: "bg-none/15 text-none",
};

export default function StatusChip({ status, children }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[status] ?? TONE.no_data}`}>
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}
